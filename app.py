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

# --- ROTAS DA API ---

@app.route('/api/products/search', methods=['GET'])
@db_required
def search_products():
    """
    Endpoint de busca de produtos com filtros dinâmicos.
    Aceita 'marca', 'modelo' e 'ano' como query parameters.
    """
    try:
        # Extrai os parâmetros de query da requisição
        marca = request.args.get('marca')
        modelo = request.args.get('modelo')
        ano = request.args.get('ano')

        # Começa com a consulta base na coleção de produtos
        query = db.collection('products')

        # Adiciona filtros dinamicamente se os parâmetros forem fornecidos
        if marca:
            query = query.where('marca', '==', marca)
        if modelo:
            query = query.where('modelo', '==', modelo)
        if ano:
            # Firestore armazena números, então convertemos o parâmetro
            try:
                query = query.where('ano', '==', int(ano))
            except (ValueError, TypeError):
                # Se o ano não for um número válido, ignora o filtro ou retorna erro
                return jsonify({"error": "O parâmetro 'ano' deve ser um número válido."}), 400

        # Executa a consulta e formata os resultados
        docs = query.stream()
        products_list = []
        for doc in docs:
            product_data = doc.to_dict()
            product_data['id'] = doc.id
            products_list.append(product_data)

        return jsonify(products_list), 200

    except Exception as e:
        logging.error(f"Erro na busca de produtos: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao buscar os produtos."}), 500


# ... (outras rotas da API, como /api/products e /api/settings, viriam aqui)


# --- ROTAS PARA SERVIR O FRONTEND ---
@app.route('/')
@app.route('/<path:path>')
def serve_static(path='index.html'):
    # Uma implementação mais robusta para servir os ficheiros estáticos e o index.html
    if path != "index.html" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        # Se o caminho não corresponder a um ficheiro estático, sirva o index.html
        # Isso é crucial para que o roteamento do lado do cliente (se houver) funcione
        return send_from_directory(app.static_folder, 'index.html')


# --- Bloco de Execução ---
if __name__ == '__main__':
    # Use o host 0.0.0.0 para ser acessível na rede local, importante para testes
    app.run(host='0.0.0.0', port=5000, debug=True)