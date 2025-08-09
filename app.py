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
# ADICIONADO: 'auth' para verificação de token
from firebase_admin import credentials, initialize_app, firestore, storage, auth
from werkzeug.security import generate_password_hash, check_password_hash
import requests
from xml.etree import ElementTree

# Carrega as variáveis de ambiente do ficheiro .env
load_dotenv()

# Configura o logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Inicializa a app Flask com o caminho estático corrigido para produção
app = Flask(__name__, static_folder='public', static_url_path='')

# --- Rota para servir o index.html e outros ficheiros estáticos ---
@app.route('/')
@app.route('/<path:path>')
def serve_static(path='index.html'):
    # Medida de segurança para garantir que apenas ficheiros permitidos sejam servidos
    if path != "index.html" and not os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, 'index.html')
    return send_from_directory(app.static_folder, path)

# Configuração da chave secreta e da sessão
SECRET_KEY = os.getenv('SESSION_SECRET')
if not SECRET_KEY:
    raise ValueError("A variável de ambiente SESSION_SECRET não foi definida!")
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
    else: # Fallback para desenvolvimento local
        cred = credentials.Certificate('serviceAccountKey.json')

    initialize_app(cred, { 'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET') })
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

# --- DECORATORS DE VALIDAÇÃO ---
def db_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not db:
            return jsonify({"error": "O serviço de base de dados não está disponível."}), 503
        return f(*args, **kwargs)
    return decorated_function

# NOVO DECORATOR: Verifica o token de autenticação do Firebase enviado pelo frontend
def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Token de autorização em falta ou inválido."}), 401
        
        id_token = auth_header.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            # Passa o UID do utilizador autenticado para a rota
            return f(uid=decoded_token['uid'], *args, **kwargs)
        except auth.InvalidIdTokenError:
            return jsonify({"error": "Token inválido."}), 401
        except auth.ExpiredIdTokenError:
            return jsonify({"error": "Token expirado."}), 401
        except Exception as e:
            logging.error(f"ERRO NA VERIFICAÇÃO DO TOKEN: {e}")
            return jsonify({"error": "Erro interno ao verificar autorização."}), 500
    return decorated_function

# --- ROTAS DE API (Frete, Pagamento, etc.) ---

# ROTA ADICIONADA: Fornece a configuração do Firebase para o frontend
@app.route('/api/firebase-config', methods=['GET'])
def get_firebase_config():
    """
    Esta rota expõe as configurações do Firebase necessárias para o cliente (frontend).
    ATENÇÃO: NUNCA exponha credenciais de serviço ou chaves secretas aqui.
    Estas são as configurações públicas para inicializar o SDK do cliente.
    """
    try:
        firebase_config = {
            "apiKey": os.getenv("FIREBASE_API_KEY"),
            "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
            "projectId": os.getenv("FIREBASE_PROJECT_ID"),
            "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
            "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
            "appId": os.getenv("FIREBASE_APP_ID")
        }
        # Verifica se todas as chaves essenciais foram carregadas
        if not all(firebase_config.values()):
            logging.error("ERRO: Variáveis de ambiente do Firebase para o frontend não estão completamente definidas.")
            return jsonify({"error": "A configuração do servidor está incompleta."}), 500
            
        return jsonify(firebase_config)
    except Exception as e:
        logging.error(f"ERRO AO OBTER CONFIG DO FIREBASE: {e}")
        return jsonify({"error": "Não foi possível obter a configuração do servidor."}), 500


@app.route('/api/shipping', methods=['POST'])
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

# ROTA DE PAGAMENTO REFEITA E SEGURA
@app.route('/api/create_payment', methods=['POST'])
@db_required
@token_required # Protege a rota, exigindo um utilizador autenticado
def create_payment(uid): # Recebe o uid do utilizador a partir do decorator
    if not sdk:
        return jsonify({"error": "Serviço de pagamento não configurado."}), 503
        
    try:
        order_data = request.get_json()
        cart_from_client = order_data.get('items', [])
        
        if not cart_from_client:
            return jsonify({"error": "O carrinho está vazio."}), 400

        # --- VALIDAÇÃO DE PREÇOS NO SERVIDOR (ANTI-FRAUDE) ---
        server_total_price = 0
        items_for_mp = []
        items_for_db = []

        for client_item in cart_from_client:
            product_id = client_item.get('id')
            quantity = int(client_item.get('quantity', 1))

            # Busca o produto na base de dados para obter o preço real
            product_ref = db.collection('products').document(product_id).get()
            if not product_ref.exists:
                return jsonify({"error": f"Produto com ID {product_id} não encontrado."}), 404
            
            product_data = product_ref.to_dict()
            product_price = float(product_data.get('preco', 0))
            product_name = product_data.get('nomeProduto', 'Produto sem nome')

            server_total_price += product_price * quantity
            
            # Adiciona à lista para o Mercado Pago com o PREÇO DO SERVIDOR
            items_for_mp.append({
                "title": product_name,
                "quantity": quantity,
                "currency_id": "BRL",
                "unit_price": product_price
            })
            # Adiciona à lista para salvar na nossa base de dados
            items_for_db.append({ "id": product_id, "name": product_name, "quantity": quantity, "price": product_price })

        # --- FIM DA VALIDAÇÃO ---
        
        # URLs de redirecionamento após o pagamento
        base_url = os.getenv('BASE_URL', request.host_url)
        back_urls = {
            "success": f"{base_url}success.html",
            "failure": f"{base_url}failure.html",
            "pending": f"{base_url}pending.html"
        }

        order_id = str(uuid.uuid4())
        
        # Cria a preferência de pagamento com os dados validados
        preference_data = {
            "items": items_for_mp,
            "payer": order_data.get("payer", {}),
            "back_urls": back_urls,
            "auto_return": "approved",
            "external_reference": order_id
        }

        preference_response = sdk.preference().create(preference_data)
        preference = preference_response["response"]
        
        # Guarda o pedido na base de dados com o ID do utilizador autenticado
        order_to_save = {
            "userId": uid,
            "mercadoPagoPreferenceId": preference["id"],
            "status": "pending",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "payer": order_data.get("payer", {}),
            "items": items_for_db, # Salva os itens com preços validados
            "total": server_total_price
        }
        db.collection('orders').document(order_id).set(order_to_save)
        
        logging.info(f"Preferência de pagamento {preference['id']} criada para o utilizador {uid}")
        return jsonify({"preference_id": preference["id"], "order_id": order_id})

    except Exception as e:
        logging.error(f"ERRO AO CRIAR PAGAMENTO: {e}")
        # Retorna uma mensagem de erro genérica para o utilizador
        return jsonify({"error": "Não foi possível processar o seu pagamento."}), 500

# (As outras rotas do seu ficheiro original, como as de admin, etc., viriam aqui)

# --- Bloco de Execução ---
if __name__ == '__main__':
    # O debug=True é apenas para desenvolvimento local.
    # Em produção, um servidor WSGI como Gunicorn é usado.
    app.run(debug=True, host='127.0.0.1', port=5000)
