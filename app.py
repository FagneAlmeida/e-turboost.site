import os
import json
import uuid
from functools import wraps
from datetime import datetime, timedelta
import logging
from urllib.parse import unquote, urlparse
import io
import re

# --- Bibliotecas de terceiros ---
import mercadopago
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from firebase_admin import credentials, initialize_app, firestore, storage, auth
from google.cloud.firestore_v1.base_query import FieldFilter
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image
import requests
from xml.etree import ElementTree

# --- CONFIGURAÇÃO INICIAL ---
load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 1. INICIALIZAÇÃO DA APLICAÇÃO FLASK
app = Flask(__name__, static_folder='public', static_url_path='')

# 2. CONFIGURAÇÃO DA APP
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
SECRET_KEY = os.getenv('SESSION_SECRET')
if not SECRET_KEY: raise ValueError("A variável de ambiente SESSION_SECRET não foi definida!")
app.secret_key = SECRET_KEY
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(days=7)
)

# 3. INICIALIZAÇÃO DE SERVIÇOS EXTERNOS
db, bucket, sdk = None, None, None
try:
    firebase_creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
    if not firebase_creds_json: raise ValueError("FIREBASE_CREDENTIALS_JSON não definida.")
    creds_dict = json.loads(firebase_creds_json)
    cred = credentials.Certificate(creds_dict)
    initialize_app(cred, {'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')})
    db = firestore.client()
    bucket = storage.bucket()
    logging.info("SUCESSO: Firebase Admin inicializado.")
except Exception as e:
    logging.error(f"ERRO CRÍTICO NA INICIALIZAÇÃO DO FIREBASE: {e}")

MERCADOPAGO_ACCESS_TOKEN = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
if MERCADOPAGO_ACCESS_TOKEN:
    sdk = mercadopago.SDK(MERCADOPAGO_ACCESS_TOKEN)
    logging.info("SDK do Mercado Pago configurado.")

# --- DECORATORS DE SEGURANÇA ---
def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return jsonify({"error": "Acesso de administrador negado."}), 403
        return f(*args, **kwargs)
    return decorated

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Token de autorização em falta ou inválido."}), 401
        id_token = auth_header.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            kwargs['uid'] = decoded_token['uid']
            return f(*args, **kwargs)
        except Exception as e:
            logging.error(f"Erro na verificação do token: {e}")
            return jsonify({"error": "Token inválido ou expirado."}), 401
    return decorated

# --- FUNÇÕES AUXILIARES ---
def optimize_image(input_image, max_size=(1280, 1280), quality=85):
    try:
        img = Image.open(input_image)
        if img.mode in ("RGBA", "P"): img = img.convert("RGB")
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        output_io = io.BytesIO()
        img.save(output_io, format='WEBP', quality=quality)
        output_io.seek(0)
        return output_io, 'image/webp'
    except Exception as e:
        logging.error(f"Erro ao otimizar imagem: {e}")
        return None, None

def upload_file_to_storage(file_stream, content_type, folder='products'):
    try:
        filename = f"{uuid.uuid4()}.webp"
        blob = bucket.blob(f"{folder}/{filename}")
        blob.upload_from_file(file_stream, content_type=content_type)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logging.error(f"Erro no upload para o Firebase Storage: {e}")
        return None

def delete_file_from_storage(image_url):
    if not image_url or not bucket: return
    try:
        parsed_url = urlparse(image_url)
        blob_name = unquote(parsed_url.path.split(f'/{bucket.name}/')[-1])
        blob = bucket.blob(blob_name)
        if blob.exists(): blob.delete()
    except Exception as e:
        logging.error(f"Erro ao excluir imagem {image_url} do Storage: {e}")

def process_product_data(form_data):
    processed_data = {}
    for key, value in form_data.items():
        if key in ['price', 'stock', 'ano', 'weight', 'length', 'width', 'height']:
            try:
                processed_data[key] = float(value) if key == 'price' else int(value)
            except (ValueError, TypeError):
                raise ValueError(f"O campo '{key}' deve ser um número válido.")
        elif key == 'isFeatured':
            processed_data[key] = str(value).lower() in ['true', 'on', '1']
        elif key == 'specifications':
             processed_data[key] = json.loads(value) if isinstance(value, str) else value
        else:
            processed_data[key] = value
    return processed_data

# --- ROTAS DA API PÚBLICA ---
@app.route('/api/firebase-config', methods=['GET'])
def get_firebase_config():
    config = {
        "apiKey": os.getenv("FIREBASE_API_KEY"), "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"), "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"), "appId": os.getenv("FIREBASE_APP_ID"),
    }
    if not all(config.values()):
        return jsonify({"error": "Configuração do servidor incompleta."}), 500
    return jsonify(config)

@app.route('/api/products', methods=['GET'])
def get_products():
    try:
        docs = db.collection('products').stream()
        products_list = [dict(id=doc.id, **doc.to_dict()) for doc in docs]
        return jsonify(products_list), 200
    except Exception as e:
        logging.error(f"Erro ao obter produtos: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/products/search', methods=['GET'])
def search_products():
    try:
        query = db.collection('products')
        if marca := request.args.get('marca'): query = query.where(filter=FieldFilter('marca', '==', marca))
        if modelo := request.args.get('modelo'): query = query.where(filter=FieldFilter('modelo', '==', modelo))
        if ano_str := request.args.get('ano'): query = query.where(filter=FieldFilter('ano', '==', int(ano_str)))
        docs = query.stream()
        products_list = [dict(id=doc.id, **doc.to_dict()) for doc in docs]
        return jsonify(products_list), 200
    except (ValueError, TypeError):
        return jsonify({"error": "Parâmetro 'ano' inválido."}), 400
    except Exception as e:
        logging.error(f"Erro na busca: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/cart-details', methods=['POST'])
def get_cart_details():
    try:
        product_ids = request.get_json().get('ids', [])
        if not product_ids: return jsonify([]), 200
        refs = [db.collection('products').document(pid) for pid in product_ids]
        docs = db.getAll(refs)
        details = [dict(id=doc.id, **doc.to_dict()) for doc in docs if doc.exists]
        return jsonify(details), 200
    except Exception as e:
        logging.error(f"Erro nos detalhes do carrinho: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/shipping', methods=['POST'])
def calculate_shipping():
    data = request.get_json()
    cep_dest = data.get('cep')
    cart_items = data.get('items', [])
    if not cep_dest or not re.match(r'^\d{8}$', cep_dest):
        return jsonify({"error": "CEP inválido."}), 400
    if not cart_items:
        return jsonify({"error": "Carrinho vazio."}), 400

    try:
        # Busca os detalhes dos produtos para obter peso e dimensões
        ids = [item['id'] for item in cart_items]
        refs = [db.collection('products').document(pid) for pid in ids]
        docs = db.getAll(refs)
        
        total_weight = 0
        # Lógica simplificada para empacotamento: soma pesos, usa dimensões do maior item.
        max_length, max_width, max_height = 0, 0, 0

        for doc in docs:
            if doc.exists:
                prod_data = doc.to_dict()
                quantity = next((item['quantity'] for item in cart_items if item['id'] == doc.id), 0)
                total_weight += prod_data.get('weight', 1) * quantity
                max_length = max(max_length, prod_data.get('length', 20))
                max_width = max(max_width, prod_data.get('width', 15))
                max_height += prod_data.get('height', 5) * quantity # Empilhamento simples

        cep_orig = os.getenv('CEP_ORIGEM', '')
        url = f"http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?sCepOrigem={cep_orig}&sCepDestino={cep_dest}&nVlPeso={total_weight}&nCdFormato=1&nVlComprimento={max_length}&nVlAltura={max_height}&nVlLargura={max_width}&nCdServico=04510&nVlDiametro=0&StrRetorno=xml"
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        root = ElementTree.fromstring(response.content)
        servico = root.find('.//cServico')
        if servico.find('Erro').text != '0':
            return jsonify({"error": servico.find('MsgErro').text}), 400
        
        return jsonify({
            "prazo": servico.find('PrazoEntrega').text,
            "valor": servico.find('Valor').text.replace(',', '.')
        })
    except requests.exceptions.RequestException as e:
        logging.error(f"Erro na API dos Correios: {e}")
        return jsonify({"error": "Serviço de frete indisponível."}), 503
    except Exception as e:
        logging.error(f"Erro ao processar frete: {e}")
        return jsonify({"error": "Erro interno no cálculo do frete."}), 500

@app.route('/api/pages/<string:page_name>', methods=['GET'])
def get_page_content(page_name):
    try:
        doc = db.collection('pages').document(page_name).get()
        return jsonify(doc.to_dict() if doc.exists else {"error": "Página não encontrada"}), 200 if doc.exists else 404
    except Exception as e:
        logging.error(f"Erro ao buscar página '{page_name}': {e}")
        return jsonify({"error": "Erro interno."}), 500

# --- ROTAS DE AUTENTICAÇÃO DO ADMIN ---
@app.route('/api/admin/check', methods=['GET'])
def admin_check():
    return jsonify({"logged_in": session.get('admin_logged_in', False)})

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json()
    username, password = data.get('username'), data.get('password')
    admin_user, admin_pass_hash = os.getenv('ADMIN_USER'), os.getenv('ADMIN_PASSWORD_HASH')
    if not admin_user or not admin_pass_hash:
        return jsonify({"error": "Admin não configurado."}), 500
    if username == admin_user and check_password_hash(admin_pass_hash, password):
        session['admin_logged_in'] = True
        return jsonify({"success": True}), 200
    return jsonify({"error": "Credenciais inválidas."}), 401

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({"success": True}), 200

# --- ROTAS DE GESTÃO DO ADMIN (PROTEGIDAS) ---
@app.route('/api/products', methods=['POST'])
@admin_required
def add_product():
    try:
        data = process_product_data(request.form)
        if 'image' not in request.files: return jsonify({"error": "Imagem em falta."}), 400
        
        file = request.files['image']
        optimized_image, mime_type = optimize_image(file)
        if not optimized_image: return jsonify({"error": "Falha ao otimizar imagem."}), 500
            
        image_url = upload_file_to_storage(optimized_image, mime_type)
        if not image_url: return jsonify({"error": "Falha no upload."}), 500
            
        data['imageUrl'] = image_url
        _, doc_ref = db.collection('products').add(data)
        return jsonify({"success": True, "id": doc_ref.id}), 201
    except Exception as e:
        logging.error(f"Erro ao adicionar produto: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/products/<string:product_id>', methods=['PUT'])
@admin_required
def update_product(product_id):
    try:
        doc_ref = db.collection('products').document(product_id)
        doc = doc_ref.get()
        if not doc.exists: return jsonify({"error": "Produto não encontrado."}), 404

        data = process_product_data(request.form)
        if 'image' in request.files:
            delete_file_from_storage(doc.to_dict().get('imageUrl'))
            file = request.files['image']
            optimized_image, mime_type = optimize_image(file)
            data['imageUrl'] = upload_file_to_storage(optimized_image, mime_type)
        
        doc_ref.update(data)
        return jsonify({"success": True}), 200
    except Exception as e:
        logging.error(f"Erro ao atualizar produto {product_id}: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/products/<string:product_id>', methods=['DELETE'])
@admin_required
def delete_product(product_id):
    try:
        doc_ref = db.collection('products').document(product_id)
        doc = doc_ref.get()
        if not doc.exists: return jsonify({"error": "Produto não encontrado."}), 404
        delete_file_from_storage(doc.to_dict().get('imageUrl'))
        doc_ref.delete()
        return jsonify({"success": True}), 200
    except Exception as e:
        logging.error(f"Erro ao deletar produto {product_id}: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/admin/orders', methods=['GET'])
@admin_required
def get_orders():
    try:
        docs = db.collection('orders').stream()
        orders = [dict(id=doc.id, **doc.to_dict()) for doc in docs]
        return jsonify(orders)
    except Exception as e:
        logging.error(f"Erro ao buscar pedidos: {e}")
        return jsonify({"error": "Erro interno"}), 500

@app.route('/api/admin/orders/<string:order_id>', methods=['PUT'])
@admin_required
def update_order_status(order_id):
    try:
        status = request.json.get('status')
        if not status: return jsonify({"error": "Status em falta."}), 400
        db.collection('orders').document(order_id).update({"status": status})
        return jsonify({"success": True})
    except Exception as e:
        logging.error(f"Erro ao atualizar pedido {order_id}: {e}")
        return jsonify({"error": "Erro interno"}), 500

# --- ROTAS DE CLIENTE (PROTEGIDAS POR TOKEN) ---
@app.route('/api/cart', methods=['GET'])
@token_required
def get_cart(uid):
    try:
        cart_doc = db.collection('carts').document(uid).get()
        return jsonify(cart_doc.to_dict().get('items', {}) if cart_doc.exists else {}), 200
    except Exception as e:
        logging.error(f"Erro ao buscar carrinho para {uid}: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/cart/sync', methods=['POST'])
@token_required
def sync_cart(uid):
    try:
        cart_items = request.get_json().get('items', {})
        db.collection('carts').document(uid).set({'items': cart_items}, merge=True)
        return jsonify({"success": True}), 200
    except Exception as e:
        logging.error(f"Erro ao sincronizar carrinho para {uid}: {e}")
        return jsonify({"error": "Erro interno."}), 500

@app.route('/api/create_payment', methods=['POST'])
@token_required
def create_payment(uid):
    try:
        data = request.get_json()
        cart_items = data.get('cart', [])
        if not cart_items: return jsonify({"error": "Carrinho vazio."}), 400

        # Validação de preços no servidor e preparação de itens
        total_amount = 0
        mp_items, order_items = [], []
        ids = [item['id'] for item in cart_items]
        docs = db.getAll([db.collection('products').document(id) for id in ids])
        
        product_map = {doc.id: doc.to_dict() for doc in docs}

        for item in cart_items:
            server_prod = product_map.get(item['id'])
            if not server_prod: raise ValueError(f"Produto {item['id']} não encontrado.")
            
            server_price = server_prod.get('price')
            if float(item['price']) != server_price:
                raise ValueError(f"Inconsistência de preço para {item['id']}.")
            
            quantity = item['quantity']
            total_amount += server_price * quantity
            mp_items.append({"title": item['name'], "quantity": quantity, "unit_price": server_price, "currency_id": "BRL"})
            order_items.append({"id": item['id'], "name": item['name'], "quantity": quantity, "price": server_price})
        
        # Salvar o pedido no Firestore ANTES de criar o pagamento
        order_data = {
            "userId": uid, "items": order_items, "total": total_amount,
            "status": "pending_payment", "createdAt": datetime.utcnow()
        }
        _, order_ref = db.collection('orders').add(order_data)
        order_id = order_ref.id

        # Criar preferência de pagamento no Mercado Pago
        preference_data = {
            "items": mp_items, "payer": {"email": data.get('payer_email')},
            "back_urls": {"success": os.getenv('FRONTEND_URL') + "/success"},
            "auto_return": "approved", "external_reference": order_id
        }
        preference = sdk.preference().create(preference_data)
        if preference["status"] != 201: raise Exception(f"Erro do Mercado Pago: {preference}")
            
        return jsonify({"preference_id": preference["response"]["id"], "order_id": order_id}), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.error(f"ERRO AO CRIAR PAGAMENTO para {uid}: {e}")
        return jsonify({"error": "Não foi possível processar o seu pagamento."}), 500

# --- ROTEAMENTO DO FRONTEND (ARQUITETURA SPA) ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify(error="Recurso da API não encontrado."), 404
    return send_from_directory(app.static_folder, 'index.html')

# --- BLOCO DE EXECUÇÃO ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
