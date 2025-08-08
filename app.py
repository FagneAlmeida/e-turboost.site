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

# Inicializa a app Flask com o caminho estático corrigido
app = Flask(__name__, static_folder='public', static_url_path='')

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

# (As outras rotas e funções auxiliares permanecem aqui...)

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

# --- NOVA ROTA DE PAGAMENTO ---
@app.route('/api/create_payment', methods=['POST'])
@db_required
def create_payment():
    if not sdk:
        return jsonify({"error": "Serviço de pagamento não configurado."}), 503
        
    try:
        order_data = request.get_json()
        
        # Cria a preferência de pagamento
        preference_data = {
            "items": order_data.get("items", []),
            "payer": {
                "name": order_data["customer"]["name"],
                "email": order_data["customer"]["email"],
            },
            "back_urls": {
                "success": f"{request.host_url}success.html",
                "failure": f"{request.host_url}failure.html",
                "pending": f"{request.host_url}failure.html"
            },
            "auto_return": "approved",
            "shipments": {
                "receiver_address": {
                    "zip_code": order_data["shipping"]["address"]["cep"],
                    "street_name": order_data["shipping"]["address"]["street"],
                    "street_number": order_data["shipping"]["address"]["number"],
                    "floor": "",
                    "apartment": order_data["shipping"]["address"]["complement"],
                },
                "cost": float(order_data["shipping"]["Valor"]),
                "mode": "not_specified",
            },
            "external_reference": str(uuid.uuid4()) # ID único para este pedido
        }

        preference_response = sdk.preference().create(preference_data)
        preference = preference_response["response"]

        # Guarda o pedido na base de dados
        order_to_save = {
            "userId": order_data["userId"],
            "mercadoPagoPreferenceId": preference["id"],
            "external_reference": preference["external_reference"],
            "status": "pending",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "customer": order_data["customer"],
            "shipping": order_data["shipping"],
            "items": order_data["items"],
            "total": sum(item['unit_price'] * item['quantity'] for item in order_data["items"]) + float(order_data["shipping"]["Valor"])
        }
        db.collection('orders').document(preference["external_reference"]).set(order_to_save)
        
        logging.info(f"Preferência de pagamento criada: {preference['id']}")
        return jsonify(preference)

    except Exception as e:
        logging.error(f"ERRO AO CRIAR PAGAMENTO: {e}")
        return jsonify({"error": f"Ocorreu um erro ao processar o seu pagamento: {e}"}), 500

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
