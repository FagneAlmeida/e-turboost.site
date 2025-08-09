import os
import json
import uuid
from functools import wraps
from datetime import timedelta
import logging
from urllib.parse import unquote, urlparse

# Bibliotecas de terceiros
import mercadopago
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from firebase_admin import credentials, initialize_app, firestore, storage, auth
from werkzeug.security import generate_password_hash, check_password_hash
import requests
from xml.etree import ElementTree

# Carrega as variáveis de ambiente do ficheiro .env
load_dotenv()

# Configura o logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Inicializa a app Flask
app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# Configuração da chave secreta e da sessão
SECRET_KEY = os.getenv('SESSION_SECRET')
if not SECRET_KEY:
    raise ValueError("A variável de ambiente SESSION_SECRET não foi definida!")
app.secret_key = SECRET_KEY
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.permanent_session_lifetime = timedelta(days=7)

# --- Bloco de Inicialização do Firebase Admin ---
db = None
bucket = None
try:
    firebase_creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
    if firebase_creds_json:
        creds_dict = json.loads(firebase_creds_json)
        cred = credentials.Certificate(creds_dict)
    else:
        cred = credentials.Certificate('serviceAccountKey.json')

    initialize_app(cred, {'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')})
    db = firestore.client()
    bucket = storage.bucket()
    logging.info("SUCESSO: Firebase Admin e Storage inicializados.")
except Exception as e:
    logging.error(f"ERRO CRÍTICO NA INICIALIZAÇÃO DO FIREBASE: {e}")

# --- Configuração do SDK do Mercado Pago ---
sdk = None
MERCADOPAGO_ACCESS_TOKEN = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
if MERCADOPAGO_ACCESS_TOKEN:
    sdk = mercadopago.SDK(MERCADOPAGO_ACCESS_TOKEN)
    logging.info("SDK do Mercado Pago configurado com sucesso.")
else:
    logging.warning("AVISO: MERCADOPAGO_ACCESS_TOKEN não encontrado.")

# --- DECORATORS ---
def db_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not db:
            return jsonify({"error": "O serviço de base de dados não está disponível."}), 503
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return jsonify({"error": "Acesso de administrador necessário."}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- FUNÇÃO AUXILIAR DE UPLOAD ---
def upload_to_firebase(file_to_upload, destination_path):
    """Faz o upload de um ficheiro para o Firebase Storage e retorna o URL público."""
    if not file_to_upload:
        return None
    try:
        blob = bucket.blob(destination_path)
        blob.upload_from_file(file_to_upload, content_type=file_to_upload.content_type)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logging.error(f"Erro no upload para o Firebase: {e}")
        return None

# --- ROTAS DE API PÚBLICAS ---

@app.route('/api/firebase-config', methods=['GET'])
def get_firebase_config():
    """ Rota adicionada para fornecer a configuração do Firebase ao frontend. """
    try:
        firebase_config = {
            "apiKey": os.getenv("FIREBASE_API_KEY"),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
            "projectId": os.getenv("FIREBASE_PROJECT_ID"),
            "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
            "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
            "appId": os.getenv("FIREBASE_APP_ID")
        }
        if not all(firebase_config.values()):
            logging.error("ERRO: Variáveis de ambiente do Firebase para o frontend não estão completamente definidas.")
            return jsonify({"error": "A configuração do servidor está incompleta."}), 500
        return jsonify(firebase_config)
    except Exception as e:
        logging.error(f"ERRO AO OBTER CONFIG DO FIREBASE: {e}")
        return jsonify({"error": "Não foi possível obter a configuração do servidor."}), 500

@app.route('/api/products', methods=['GET'])
@db_required
def get_products():
    try:
        products_ref = db.collection('products').stream()
        products_list = []
        for product in products_ref:
            product_data = product.to_dict()
            product_data['id'] = product.id
            products_list.append(product_data)
        return jsonify(products_list), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR PRODUTOS: {e}")
        return jsonify({"error": "Não foi possível carregar os produtos."}), 500

# ... (outras rotas públicas como shipping, create_payment, etc.)

# --- ROTAS DE ADMINISTRAÇÃO ---
@app.route('/api/admin/check', methods=['GET'])
@db_required
def check_admin_exists():
    admin_ref = db.collection('admin').limit(1).get()
    return jsonify({'adminExists': len(admin_ref) > 0})

@app.route('/api/admin/register', methods=['POST'])
@db_required
def register_admin():
    admin_ref = db.collection('admin').limit(1).get()
    if len(admin_ref) > 0:
        return jsonify({"error": "Um administrador já está registado."}), 403
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "Utilizador e senha são obrigatórios."}), 400
    hashed_password = generate_password_hash(password)
    db.collection('admin').add({'username': username, 'password': hashed_password})
    return jsonify({"success": "Administrador registado com sucesso."}), 201

@app.route('/api/admin/login', methods=['POST'])
@db_required
def login_admin():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    admin_query = db.collection('admin').where('username', '==', username).limit(1).get()
    if not admin_query:
        return jsonify({"error": "Credenciais inválidas."}), 401
    
    admin_data = admin_query[0].to_dict()
    if check_password_hash(admin_data['password'], password):
        session.permanent = True
        session['admin_logged_in'] = True
        session['username'] = username
        return jsonify({"success": "Login bem-sucedido."})
    
    return jsonify({"error": "Credenciais inválidas."}), 401

@app.route('/api/admin/logout', methods=['POST'])
def logout_admin():
    session.clear()
    return jsonify({"success": "Logout bem-sucedido."})

@app.route('/api/admin/session', methods=['GET'])
def check_admin_session():
    if 'admin_logged_in' in session:
        return jsonify({"isLoggedIn": True, "username": session.get('username')})
    return jsonify({"isLoggedIn": False})

# --- ROTA DE GESTÃO DE PEDIDOS ---
@app.route('/api/admin/orders', methods=['GET'])
@admin_required
@db_required
def get_orders():
    """ Rota para buscar todos os pedidos para o painel de administração. """
    try:
        # Ordena os pedidos por data de criação, dos mais recentes para os mais antigos
        orders_ref = db.collection('orders').order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
        orders_list = []
        for order in orders_ref:
            order_data = order.to_dict()
            order_data['id'] = order.id
            # Converte o timestamp para uma string legível (ISO 8601)
            if 'createdAt' in order_data and hasattr(order_data['createdAt'], 'isoformat'):
                order_data['createdAt'] = order_data['createdAt'].isoformat()
            orders_list.append(order_data)
        return jsonify(orders_list), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR PEDIDOS: {e}")
        return jsonify({"error": "Não foi possível carregar os pedidos."}), 500


# --- ROTAS CRUD DE PRODUTOS (IMPLEMENTAÇÃO COMPLETA) ---

@app.route('/api/products', methods=['POST'])
@admin_required
@db_required
def add_product():
    try:
        data = request.form.to_dict()
        data['preco'] = float(data.get('preco', 0))
        data['isFeatured'] = data.get('isFeatured') == 'on'
        data['ano'] = [int(y.strip()) for y in data.get('ano', '').split(',') if y.strip().isdigit()]
        
        if 'imagem' in request.files:
            image_file = request.files['imagem']
            filename = f"products/{uuid.uuid4()}_{image_file.filename}"
            image_url = upload_to_firebase(image_file, filename)
            if image_url:
                data['imagemURL1'] = image_url

        db.collection('products').add(data)
        return jsonify({"message": "Produto adicionado com sucesso!"}), 201
    except Exception as e:
        logging.error(f"Erro ao adicionar produto: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao adicionar o produto."}), 500

@app.route('/api/products/<product_id>', methods=['PUT'])
@admin_required
@db_required
def update_product(product_id):
    try:
        data = request.form.to_dict()
        product_ref = db.collection('products').document(product_id)

        if 'preco' in data: data['preco'] = float(data['preco'])
        data['isFeatured'] = data.get('isFeatured') == 'on'
        if 'ano' in data: data['ano'] = [int(y.strip()) for y in data.get('ano', '').split(',') if y.strip().isdigit()]

        if 'imagem' in request.files:
            image_file = request.files['imagem']
            if image_file.filename != '':
                filename = f"products/{uuid.uuid4()}_{image_file.filename}"
                image_url = upload_to_firebase(image_file, filename)
                if image_url:
                    data['imagemURL1'] = image_url
        
        product_ref.update(data)
        return jsonify({"message": "Produto atualizado com sucesso!"}), 200
    except Exception as e:
        logging.error(f"Erro ao atualizar produto {product_id}: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao atualizar o produto."}), 500

@app.route('/api/products/<product_id>', methods=['DELETE'])
@admin_required
@db_required
def delete_product(product_id):
    try:
        product_ref = db.collection('products').document(product_id)
        product_doc = product_ref.get()
        if not product_doc.exists:
            return jsonify({"error": "Produto não encontrado."}), 404
        
        product_data = product_doc.to_dict()
        if 'imagemURL1' in product_data:
            try:
                parsed_url = urlparse(product_data['imagemURL1'])
                path_parts = parsed_url.path.split('/')
                if len(path_parts) >= 2:
                    blob_name = f"products/{unquote(path_parts[-1])}"
                    blob = bucket.blob(blob_name)
                    if blob.exists():
                        blob.delete()
            except Exception as e:
                logging.warning(f"Não foi possível apagar a imagem do produto {product_id}: {e}")

        product_ref.delete()
        return jsonify({"message": "Produto eliminado com sucesso!"}), 200
    except Exception as e:
        logging.error(f"Erro ao eliminar produto {product_id}: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao eliminar o produto."}), 500

# --- ROTAS DE CONFIGURAÇÕES (IMPLEMENTAÇÃO COMPLETA) ---

@app.route('/api/settings', methods=['GET'])
@db_required
def get_settings():
    try:
        settings_ref = db.collection('settings').document('storeConfig').get()
        if settings_ref.exists:
            return jsonify(settings_ref.to_dict()), 200
        return jsonify({}), 200
    except Exception as e:
        logging.error(f"Erro ao buscar configurações: {e}")
        return jsonify({"error": "Não foi possível carregar as configurações."}), 500

@app.route('/api/settings', methods=['POST'])
@admin_required
@db_required
def update_settings():
    try:
        data = request.form.to_dict()
        settings_ref = db.collection('settings').document('storeConfig')

        if 'logoFile' in request.files:
            logo_file = request.files['logoFile']
            if logo_file.filename != '':
                logo_url = upload_to_firebase(logo_file, f"site/logo_{uuid.uuid4()}")
                if logo_url: data['logoUrl'] = logo_url
        
        if 'faviconFile' in request.files:
            favicon_file = request.files['faviconFile']
            if favicon_file.filename != '':
                favicon_url = upload_to_firebase(favicon_file, f"site/favicon_{uuid.uuid4()}")
                if favicon_url: data['faviconUrl'] = favicon_url

        settings_ref.set(data, merge=True)
        return jsonify({"message": "Configurações salvas com sucesso!"}), 200
    except Exception as e:
        logging.error(f"Erro ao salvar configurações: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao salvar as configurações."}), 500

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
