import os
import json
import uuid
from functools import wraps
from datetime import datetime, timedelta
import logging
from urllib.parse import unquote, urlparse

# Bibliotecas de terceiros
import mercadopago
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session, send_from_directory
from firebase_admin import credentials, initialize_app, firestore, storage
from werkzeug.security import generate_password_hash, check_password_hash
import requests
from xml.etree import ElementTree

# Carrega as variáveis de ambiente do ficheiro .env
load_dotenv()

# Configura o logging para um formato mais detalhado
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Inicializa a app Flask
app = Flask(__name__, static_folder='public')

# --- Rota para servir o index.html e outros ficheiros estáticos ---
@app.route('/')
@app.route('/<path:path>')
def serve_static(path='index.html'):
    return send_from_directory(app.static_folder, path)

# Configuração da chave secreta e da sessão
SECRET_KEY = os.getenv('SESSION_SECRET')
if not SECRET_KEY:
    raise ValueError("A variável de ambiente SESSION_SECRET não foi definida! Crie um .env e adicione-a.")
app.secret_key = SECRET_KEY
app.permanent_session_lifetime = timedelta(days=7)

# --- Bloco de Inicialização do Firebase Admin ---
db = None
bucket = None
try:
    firebase_creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
    if firebase_creds_json:
        creds_dict = json.loads(firebase_creds_json)
        cred = credentials.Certificate(creds_dict)
    elif os.path.exists('serviceAccountKey.json'):
        cred = credentials.Certificate('serviceAccountKey.json')
    else:
        raise ValueError("Configuração do Firebase Admin não encontrada.")

    initialize_app(cred, {
        'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
    })
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

# --- Decorators de Validação ---
def db_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not db:
            return jsonify({"error": "O serviço de base de dados não está disponível."}), 503
        return f(*args, **kwargs)
    return decorated_function

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return jsonify({'error': 'Acesso não autorizado. Requer login.'}), 401
        return f(*args, **kwargs)
    return decorated_function

# --- Funções Auxiliares para Gestão de Ficheiros ---
def upload_file_to_storage(file, folder):
    """Faz o upload de um ficheiro para o Firebase Storage e retorna a sua URL pública."""
    if not file or not file.filename or not bucket: return None
    try:
        filename = f"{folder}/{uuid.uuid4()}-{file.filename}"
        blob = bucket.blob(filename)
        blob.upload_from_file(file, content_type=file.content_type)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logging.error(f"ERRO NO UPLOAD DO FICHEIRO '{file.filename}': {e}")
        return None

def delete_file_from_storage(file_url):
    """Apaga um ficheiro do Firebase Storage a partir da sua URL."""
    if not file_url or not bucket: return False
    try:
        # Extrai o caminho do ficheiro da URL
        parsed_url = urlparse(file_url)
        # O caminho do blob está depois de '/o/' e precisa de ser descodificado
        path_segments = parsed_url.path.split('/o/')
        if len(path_segments) < 2:
            logging.warning(f"URL de ficheiro inválida para exclusão: {file_url}")
            return False
            
        blob_path = unquote(path_segments[1])
        
        blob = bucket.blob(blob_path)
        if blob.exists():
            blob.delete()
            logging.info(f"Ficheiro órfão apagado do Storage: {blob_path}")
            return True
        else:
            logging.warning(f"Tentativa de apagar ficheiro não existente no Storage: {blob_path}")
            return False
    except Exception as e:
        logging.error(f"ERRO AO APAGAR FICHEIRO DO STORAGE '{file_url}': {e}")
        return False

# --- API para Configuração do Firebase no Cliente ---
@app.route('/api/firebase-config')
def get_firebase_config():
    config = {
        "apiKey": os.getenv("FIREBASE_API_KEY"),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.getenv("FIREBASE_APP_ID")
    }
    if not all(config.values()):
        return jsonify({"error": "Configuração do servidor incompleta."}), 500
    return jsonify(config)

# --- ROTAS DE API DE ADMIN ---
@app.route('/api/check-session')
def check_session():
    return jsonify({'logged_in': 'admin_logged_in' in session})

@app.route('/login', methods=['POST'])
@db_required
def login():
    try:
        data = request.get_json()
        if not data or 'username' not in data or 'password' not in data:
             raise KeyError("Dados de entrada ausentes (username ou password).")
        admin_doc = list(db.collection('admins').where('username', '==', data['username']).limit(1).stream())
        if not admin_doc:
            return jsonify({'error': 'Utilizador ou senha inválidos.'}), 401
        admin_data = admin_doc[0].to_dict()
        if check_password_hash(admin_data['password_hash'], data['password']):
            session['admin_logged_in'] = True
            session.permanent = True
            return jsonify({'message': 'Login bem-sucedido.'}), 200
        return jsonify({'error': 'Utilizador ou senha inválidos.'}), 401
    except KeyError as e:
        return jsonify({'error': f'Dados de entrada inválidos: {e}'}), 400
    except Exception as e:
        return jsonify({'error': f'Erro no processo de login: {e}'}), 500

# --- ROTAS DE API DE PRODUTOS (CRUD) ---
@app.route('/api/products', methods=['GET'])
@db_required
def get_products():
    try:
        products = [doc.to_dict() | {'id': doc.id} for doc in db.collection('products').stream()]
        return jsonify(products), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR PRODUTOS: {e}")
        return jsonify({'error': f'Erro interno ao buscar produtos: {e}'}), 500

def process_product_data(form_data):
    """Processa e converte os dados do formulário de produto para o formato correto."""
    data = dict(form_data)
    if 'ano' in data and data['ano']:
        data['ano'] = [int(a.strip()) for a in data['ano'].split(',') if a.strip().isdigit()]
    else:
        data['ano'] = []
    for key in ['preco', 'peso', 'comprimento', 'altura', 'largura']:
        if key in data and data[key]:
            try: data[key] = float(data[key].replace(',', '.'))
            except (ValueError, TypeError): data[key] = 0.0
    data['isFeatured'] = data.get('isFeatured') == 'on'
    data['lastUpdatedAt'] = firestore.SERVER_TIMESTAMP
    return data

@app.route('/api/products', methods=['POST'])
@login_required
@db_required
def add_product():
    try:
        data = process_product_data(request.form)
        data['createdAt'] = firestore.SERVER_TIMESTAMP
        for i in range(1, 4):
            if f'imagemURL{i}' in request.files:
                url = upload_file_to_storage(request.files[f'imagemURL{i}'], 'products')
                if url: data[f'imagemURL{i}'] = url
        
        _, doc_ref = db.collection('products').add(data)
        return jsonify({'message': 'Produto adicionado com sucesso', 'id': doc_ref.id}), 201
    except Exception as e:
        logging.error(f"ERRO AO ADICIONAR PRODUTO: {e}")
        return jsonify({'error': f'Erro ao adicionar produto: {e}'}), 500

@app.route('/api/products/<product_id>', methods=['PUT'])
@login_required
@db_required
def update_product(product_id):
    try:
        product_ref = db.collection('products').document(product_id)
        old_product_data = product_ref.get().to_dict() or {}
        
        data = process_product_data(request.form)
        for i in range(1, 4):
            image_key = f'imagemURL{i}'
            if image_key in request.files and request.files[image_key].filename:
                if old_product_data.get(image_key):
                    delete_file_from_storage(old_product_data[image_key])
                url = upload_file_to_storage(request.files[image_key], 'products')
                if url: data[image_key] = url
        
        product_ref.update(data)
        return jsonify({'message': 'Produto atualizado com sucesso.'}), 200
    except Exception as e:
        logging.error(f"ERRO AO ATUALIZAR PRODUTO {product_id}: {e}")
        return jsonify({'error': f'Erro ao atualizar produto: {e}'}), 500

@app.route('/api/products/<product_id>', methods=['DELETE'])
@login_required
@db_required
def delete_product(product_id):
    try:
        product_ref = db.collection('products').document(product_id)
        product_data = product_ref.get().to_dict()

        if product_data:
            for i in range(1, 4):
                if f'imagemURL{i}' in product_data:
                    delete_file_from_storage(product_data[f'imagemURL{i}'])
        
        product_ref.delete()
        return jsonify({'message': 'Produto eliminado com sucesso.'}), 200
    except Exception as e:
        logging.error(f"ERRO AO ELIMINAR PRODUTO {product_id}: {e}")
        return jsonify({'error': f'Erro ao eliminar produto: {e}'}), 500

# --- ROTAS DE API DE CONFIGURAÇÕES ---
@app.route('/api/settings', methods=['GET'])
@db_required
def get_settings():
    try:
        settings_doc = db.collection('settings').document('storeConfig').get()
        return jsonify(settings_doc.to_dict() if settings_doc.exists else {}), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR CONFIGURAÇÕES: {e}")
        return jsonify({'error': f'Erro ao buscar configurações: {e}'}), 500

@app.route('/api/settings', methods=['POST'])
@login_required
@db_required
def save_settings():
    try:
        settings_ref = db.collection('settings').document('storeConfig')
        old_settings = settings_ref.get().to_dict() or {}
        data = request.form.to_dict()

        if 'logoFile' in request.files and request.files['logoFile'].filename:
            if old_settings.get('logoUrl'):
                delete_file_from_storage(old_settings['logoUrl'])
            url = upload_file_to_storage(request.files['logoFile'], 'branding')
            if url: data['logoUrl'] = url

        if 'faviconFile' in request.files and request.files['faviconFile'].filename:
            if old_settings.get('faviconUrl'):
                delete_file_from_storage(old_settings['faviconUrl'])
            url = upload_file_to_storage(request.files['faviconFile'], 'branding')
            if url: data['faviconUrl'] = url
        
        settings_ref.set(data, merge=True)
        return jsonify({'message': 'Configurações guardadas com sucesso.'}), 200
    except Exception as e:
        logging.error(f"ERRO AO GUARDAR CONFIGURAÇÕES: {e}")
        return jsonify({'error': f'Erro ao guardar configurações: {e}'}), 500

# --- ROTAS DE API DE FRETE ---
@app.route('/api/shipping', methods=['POST'])
@db_required
def calculate_shipping():
    data = request.get_json()
    cep_destino = data.get('cep', '').replace('-', '').strip()
    cart_items = data.get('items', [])

    if not cep_destino or len(cep_destino) != 8:
        return jsonify({"error": "CEP de destino deve conter 8 dígitos."}), 400
    if not cart_items:
        return jsonify([])

    try:
        peso_total_kg = sum(float(item.get('peso', 0.3) or 0.3) * int(item.get('quantity', 1) or 1) for item in cart_items)
        comprimento_cm = max(float(item.get('comprimento', 16) or 16) for item in cart_items)
        largura_cm = max(float(item.get('largura', 11) or 11) for item in cart_items)
        altura_cm = max(float(item.get('altura', 5) or 5) for item in cart_items)
        
        comprimento_cm = max(comprimento_cm, 16.0)
        largura_cm = max(largura_cm, 11.0)
        altura_cm = max(altura_cm, 2.0)
        
        valor_total_produtos = sum(float(item.get('preco', 0)) * int(item.get('quantity', 1)) for item in cart_items)
        
    except (ValueError, TypeError):
        return jsonify({"error": "Dados inválidos nos itens do carrinho."}), 400

    try:
        cep_origem = os.getenv('CEP_ORIGEM', '01001000')
        
        params = {
            'nCdEmpresa': os.getenv('CORREIOS_CODIGO_EMPRESA', ''),
            'sDsSenha': os.getenv('CORREIOS_SENHA', ''),
            'sCepOrigem': cep_origem,
            'sCepDestino': cep_destino,
            'nVlPeso': str(peso_total_kg),
            'nCdFormato': '1',
            'nVlComprimento': str(comprimento_cm),
            'nVlAltura': str(altura_cm),
            'nVlLargura': str(largura_cm),
            'nVlDiametro': '0',
            'sCdMaoPropria': 'n',
            'nVlValorDeclarado': str(valor_total_produtos),
            'sCdAvisoRecebimento': 'n',
            'nCdServico': '04510,04014',
            'StrRetorno': 'xml',
            'nIndicaCalculo': '3'
        }
        
        response = requests.get("http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx", params=params)
        response.raise_for_status()

        root = ElementTree.fromstring(response.content)
        options = []
        for servico in root.findall('.//cServico'):
            codigo = servico.find('Codigo').text
            valor_str = servico.find('Valor').text
            prazo = servico.find('PrazoEntrega').text
            erro_code = servico.find('Erro').text
            msg_erro = servico.find('MsgErro').text

            if erro_code == '0':
                options.append({
                    "Nome": "PAC" if codigo == "04510" else "SEDEX",
                    "Codigo": codigo,
                    "Valor": valor_str.replace(',', '.'),
                    "PrazoEntrega": prazo
                })
        
        if not options and msg_erro:
             logging.error(f"Erro da API dos Correios: {msg_erro}")
             return jsonify({"error": f"Não foi possível calcular o frete: {msg_erro}"}), 500

        return jsonify(options)

    except requests.exceptions.RequestException as e:
        logging.error(f"ERRO DE CONEXÃO COM API DE FRETE: {e}")
        return jsonify({"error": "Serviço de cálculo de frete indisponível no momento."}), 503
    except Exception as e:
        logging.error(f"ERRO INESPERADO NO CÁLCULO DE FRETE: {e}")
        return jsonify({"error": "Ocorreu um erro inesperado ao calcular o frete."}), 500

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
