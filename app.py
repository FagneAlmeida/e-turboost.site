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

# Carrega as variáveis de ambiente
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

# --- INICIALIZAÇÃO DE SERVIÇOS (Firebase, Mercado Pago) ---
db, bucket, sdk = None, None, None
try:
    firebase_creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
    creds_dict = json.loads(firebase_creds_json) if firebase_creds_json else 'serviceAccountKey.json'
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

# --- DECORATORS ---
def db_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not db: return jsonify({"error": "Base de dados indisponível."}), 503
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'admin_logged_in' not in session: return jsonify({"error": "Acesso negado."}), 403
        return f(*args, **kwargs)
    return decorated

# --- ROTAS ---
@app.route('/')
@app.route('/<path:path>')
def serve_static(path='index.html'):
    # ... (código existente para servir ficheiros estáticos)
    pass

# ... (TODAS as outras rotas, públicas e de admin, vêm aqui)

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)
