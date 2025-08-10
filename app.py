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

# 1. INICIALIZAÇÃO DA APLICAÇÃO FLASK (CORREÇÃO APLICADA)
app = Flask(__name__, static_folder='public', static_url_path='')

# 2. CONFIGURAÇÃO DA APP
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
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
        if not db: return jsonify({"error": "O serviço de base de dados não está disponível."}), 503
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session: return jsonify({"error": "Acesso de administrador necessário."}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- FUNÇÃO AUXILIAR DE UPLOAD ---
def upload_to_firebase(file_to_upload, destination_path):
    if not file_to_upload: return None
    try:
        blob = bucket.blob(destination_path)
        blob.upload_from_file(file_to_upload, content_type=file_to_upload.content_type)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logging.error(f"Erro no upload para o Firebase: {e}")
        return None

# --- ROTAS DE SERVIÇO DE FICHEIROS ESTÁTICOS ---
@app.route('/')
@app.route('/<path:path>')
def serve_static(path='index.html'):
    if not os.path.exists(os.path.join(app.static_folder, path)) or os.path.isdir(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, 'index.html')
    return send_from_directory(app.static_folder, path)

# --- ROTAS DE API PÚBLICAS ---
@app.route('/api/firebase-config', methods=['GET'])
def get_firebase_config():
    # ... (código existente)
    pass

@app.route('/api/products', methods=['GET'])
@db_required
def get_products():
    # ... (código existente)
    pass

@app.route('/api/products/search', methods=['GET'])
@db_required
def search_products():
    # ... (código existente)
    pass
    
@app.route('/api/pages/<page_name>', methods=['GET'])
@db_required
def get_page_content(page_name):
    # ... (código existente)
    pass

@app.route('/api/settings', methods=['GET'])
@db_required
def get_settings():
    # ... (código existente)
    pass

# --- ROTAS DE ADMINISTRAÇÃO ---
@app.route('/api/admin/check', methods=['GET'])
@db_required
def check_admin_exists():
    # ... (código existente)
    pass

# ... (todas as outras rotas de admin: register, login, logout, session, CRUD de produtos, pedidos, etc.)

@app.route('/api/settings', methods=['POST'])
@admin_required
@db_required
def update_settings():
    # ... (código existente)
    pass

@app.route('/api/admin/pages/<page_name>', methods=['POST'])
@admin_required
@db_required
def update_page_content(page_name):
    # ... (código existente)
    pass

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
