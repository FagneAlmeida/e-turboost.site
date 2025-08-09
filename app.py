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
        products_list = [dict(id=p.id, **p.to_dict()) for p in products_ref]
        return jsonify(products_list), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR PRODUTOS: {e}")
        return jsonify({"error": "Não foi possível carregar os produtos."}), 500

@app.route('/api/products/search', methods=['GET'])
@db_required
def search_products():
    """Filtra produtos com base nos parâmetros de query (marca, modelo, ano)."""
    try:
        marca = request.args.get('marca', '').strip().lower()
        modelo = request.args.get('modelo', '').strip().lower()
        ano = request.args.get('ano', '').strip()

        products_ref = db.collection('products').stream()
        results = []
        for product in products_ref:
            product_data = product.to_dict()
            product_data['id'] = product.id
            
            p_marca = product_data.get('marca', '').lower()
            p_modelo = product_data.get('modelo', '').lower()
            p_ano_list = product_data.get('ano', [])

            match_marca = not marca or marca == p_marca
            match_modelo = not modelo or modelo == p_modelo
            match_ano = not ano or (ano.isdigit() and int(ano) in p_ano_list)

            if match_marca and match_modelo and match_ano:
                results.append(product_data)

        return jsonify(results), 200
    except Exception as e:
        logging.error(f"ERRO AO BUSCAR PRODUTOS: {e}")
        return jsonify({"error": "Não foi possível realizar a busca."}), 500

# ... (outras rotas públicas como shipping, create_payment, pages, etc.)

# --- ROTAS DE ADMINISTRAÇÃO ---
# ... (todas as rotas de admin, CRUD de produtos, pedidos, settings, pages, etc.)

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
