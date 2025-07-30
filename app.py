import os
import json
import uuid
from functools import wraps
from datetime import datetime

# Bibliotecas de terceiros
import mercadopago
from dotenv import load_dotenv
from flask import Flask, request, jsonify, session
from firebase_admin import credentials, initialize_app, firestore, storage
from werkzeug.security import generate_password_hash, check_password_hash
from pycep_correios import WebService, Correios
from pycep_correios.exceptions import CorreiosTimeOut, CEPNotFound

# Carrega as variáveis de ambiente do ficheiro .env
load_dotenv()

# Inicializa a app Flask
app = Flask(__name__, static_folder='public', static_url_path='')

# Configuração da chave secreta para sessões
SECRET_KEY = os.getenv('SESSION_SECRET')
if not SECRET_KEY:
    raise ValueError("A variável de ambiente SESSION_SECRET não foi definida! Crie um .env e adicione-a.")
app.secret_key = SECRET_KEY

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
    print("SUCESSO: Firebase Admin e Storage inicializados.")
except Exception as e:
    print(f"ERRO CRÍTICO NA INICIALIZAÇÃO DO FIREBASE: {e}")

# --- Configuração do SDK do Mercado Pago ---
sdk = None
MERCADOPAGO_ACCESS_TOKEN = os.getenv("MERCADOPAGO_ACCESS_TOKEN")
if MERCADOPAGO_ACCESS_TOKEN:
    sdk = mercadopago.SDK(MERCADOPAGO_ACCESS_TOKEN)
    print("SDK do Mercado Pago configurado com sucesso.")
else:
    print("AVISO: MERCADOPAGO_ACCESS_TOKEN não encontrado.")

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
            return jsonify({'message': 'Acesso não autorizado.'}), 401
        return f(*args, **kwargs)
    return decorated_function

# --- Função Auxiliar para Upload de Ficheiros com Validação ---
def upload_file_to_storage(file, folder):
    if not file or not file.filename:
        return None
    try:
        filename = f"{folder}/{uuid.uuid4()}-{file.filename}"
        blob = bucket.blob(filename)
        blob.upload_from_file(file, content_type=file.content_type)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"ERRO NO UPLOAD DO FICHEIRO '{file.filename}': {e}")
        return None

# --- ROTAS DE API DE ADMIN ---
@app.route('/api/check-session')
def check_session():
    return jsonify({'logged_in': 'admin_logged_in' in session})

@app.route('/api/check-admin', methods=['GET'])
@db_required
def check_admin():
    try:
        admins_ref = db.collection('admins')
        return jsonify({'adminExists': any(admins_ref.limit(1).stream())})
    except Exception as e:
        return jsonify({'message': f'Erro ao verificar admin: {e}'}), 500

@app.route('/api/register', methods=['POST'])
@db_required
def register_admin():
    try:
        if any(db.collection('admins').limit(1).stream()):
            return jsonify({'message': 'Um administrador já existe.'}), 409
        data = request.get_json()
        hashed_password = generate_password_hash(data['password'])
        db.collection('admins').add({'username': data['username'], 'password_hash': hashed_password})
        return jsonify({'message': 'Administrador registado com sucesso.'}), 201
    except Exception as e:
        return jsonify({'message': f'Erro ao registar admin: {e}'}), 500

@app.route('/login', methods=['POST'])
@db_required
def login():
    try:
        data = request.get_json()
        admin_doc = list(db.collection('admins').where('username', '==', data['username']).limit(1).stream())
        if not admin_doc:
            return jsonify({'message': 'Utilizador ou senha inválidos.'}), 401
        admin_data = admin_doc[0].to_dict()
        if check_password_hash(admin_data['password_hash'], data['password']):
            session['admin_logged_in'] = True
            session.permanent = True # Torna a sessão mais duradoura
            return jsonify({'message': 'Login bem-sucedido.'}), 200
        return jsonify({'message': 'Utilizador ou senha inválidos.'}), 401
    except Exception as e:
        return jsonify({'message': f'Erro no processo de login: {e}'}), 500

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('admin_logged_in', None)
    return jsonify({'message': 'Logout bem-sucedido.'}), 200

# --- ROTAS DE API DE PRODUTOS ---
@app.route('/api/products', methods=['GET'])
@db_required
def get_products():
    try:
        products = [doc.to_dict() | {'id': doc.id} for doc in db.collection('products').stream()]
        return jsonify(products), 200
    except Exception as e:
        return jsonify({'message': f'Erro interno ao buscar produtos: {e}'}), 500

def process_product_data(form_data):
    data = dict(form_data)
    if 'ano' in data and data['ano']:
        data['ano'] = [int(a.strip()) for a in data['ano'].split(',') if a.strip().isdigit()]
    else:
        data['ano'] = []
    for key in ['preco', 'peso', 'comprimento', 'altura', 'largura']:
        if key in data and data[key]:
            try: data[key] = float(data[key])
            except (ValueError, TypeError): data[key] = 0.0
    data['isFeatured'] = data.get('isFeatured') == 'on'
    return data

@app.route('/api/products', methods=['POST'])
@login_required
@db_required
def add_product():
    try:
        data = process_product_data(request.form)
        for i in range(1, 4):
            if f'imagemURL{i}' in request.files:
                url = upload_file_to_storage(request.files[f'imagemURL{i}'], 'products')
                if url: data[f'imagemURL{i}'] = url
        
        _, doc_ref = db.collection('products').add(data)
        return jsonify({'message': 'Produto adicionado com sucesso', 'id': doc_ref.id}), 201
    except Exception as e:
        return jsonify({'message': f'Erro ao adicionar produto: {e}'}), 500

@app.route('/api/products/<product_id>', methods=['PUT'])
@login_required
@db_required
def update_product(product_id):
    try:
        data = process_product_data(request.form)
        for i in range(1, 4):
            if f'imagemURL{i}' in request.files and request.files[f'imagemURL{i}'].filename:
                url = upload_file_to_storage(request.files[f'imagemURL{i}'], 'products')
                if url: data[f'imagemURL{i}'] = url
        
        db.collection('products').document(product_id).update(data)
        return jsonify({'message': 'Produto atualizado com sucesso.'}), 200
    except Exception as e:
        return jsonify({'message': f'Erro ao atualizar produto: {e}'}), 500

@app.route('/api/products/<product_id>', methods=['DELETE'])
@login_required
@db_required
def delete_product(product_id):
    try:
        db.collection('products').document(product_id).delete()
        return jsonify({'message': 'Produto eliminado com sucesso.'}), 200
    except Exception as e:
        return jsonify({'message': f'Erro ao eliminar produto: {e}'}), 500

# --- ROTAS DE API DE CONFIGURAÇÕES ---
@app.route('/api/settings', methods=['GET'])
@db_required
def get_settings():
    try:
        settings_doc = db.collection('settings').document('storeConfig').get()
        return jsonify(settings_doc.to_dict() if settings_doc.exists else {}), 200
    except Exception as e:
        return jsonify({'message': f'Erro ao buscar configurações: {e}'}), 500

@app.route('/api/settings', methods=['POST'])
@login_required
@db_required
def save_settings():
    try:
        data = request.form.to_dict()
        if 'logoFile' in request.files:
            url = upload_file_to_storage(request.files['logoFile'], 'branding')
            if url: data['logoUrl'] = url
        if 'faviconFile' in request.files:
            url = upload_file_to_storage(request.files['faviconFile'], 'branding')
            if url: data['faviconUrl'] = url
        
        db.collection('settings').document('storeConfig').set(data, merge=True)
        return jsonify({'message': 'Configurações guardadas com sucesso.'}), 200
    except Exception as e:
        return jsonify({'message': f'Erro ao guardar configurações: {e}'}), 500

# --- ROTAS DE API DE FRETE E PAGAMENTO ---
@app.route('/api/shipping', methods=['POST'])
@db_required
def calculate_shipping():
    data = request.get_json()
    cep_destino = data.get('cep')
    cart_items = data.get('items', [])

    if not cep_destino:
        return jsonify({"error": "CEP de destino é obrigatório."}), 400

    try:
        peso_total_kg = sum(float(item.get('peso', 0.3) or 0.3) * int(item.get('quantity', 1) or 1) for item in cart_items)
        comprimento_total_cm = max(float(item.get('comprimento', 16) or 16) for item in cart_items) if cart_items else 16
        largura_total_cm = max(float(item.get('largura', 11) or 11) for item in cart_items) if cart_items else 11
        altura_total_cm = sum(float(item.get('altura', 5) or 5) * int(item.get('quantity', 1) or 1) for item in cart_items)
    except (ValueError, TypeError):
        return jsonify({"error": "Dados inválidos nos itens do carrinho."}), 400

    peso_total_kg = max(peso_total_kg, 0.3)
    comprimento_total_cm = max(comprimento_total_cm, 16.0)
    largura_total_cm = max(largura_total_cm, 11.0)
    altura_total_cm = max(altura_total_cm, 2.0)

    try:
        settings_doc = db.collection('settings').document('storeConfig').get().to_dict() or {}
        cep_origem = settings_doc.get('cepOrigem')
        if not cep_origem:
            return jsonify({"error": "CEP de origem não configurado no painel de admin."}), 500

        correios = Correios()
        frete_result = correios.frete(
            cep_origem=cep_origem, cep_destino=cep_destino,
            cod_servicos=[WebService.SEDEX, WebService.PAC],
            peso=peso_total_kg, formato=1, comprimento=comprimento_total_cm,
            altura=altura_total_cm, largura=largura_total_cm
        )
        
        options = []
        for f in frete_result:
            if f.get('erro') == '0':
                options.append({
                    "Nome": f['nome'], "Codigo": f['codigo'],
                    "Valor": f['valor'].replace(',', '.'), "PrazoEntrega": f['prazo']
                })
        return jsonify(options)
    except (CorreiosTimeOut, CEPNotFound):
        return jsonify({"error": "Não foi possível calcular o frete para o CEP informado."}), 400
    except Exception as e:
        print(f"ERRO NO CÁLCULO DE FRETE: {e}")
        return jsonify({"error": "Ocorreu um erro inesperado ao calcular o frete."}), 500

@app.route('/api/create-payment', methods=['POST'])
@db_required
def create_payment():
    if not sdk:
        return jsonify({"message": "O serviço de pagamento não está configurado."}), 503
    try:
        data = request.get_json()
        items_list = []
        for item in data['cartItems']:
            items_list.append({
                "title": item.get('nomeProduto'), "quantity": int(item.get('quantity')),
                "unit_price": float(item.get('preco')), "currency_id": "BRL"
            })
        items_list.append({
            "title": "Frete", "quantity": 1,
            "unit_price": float(data['shippingOption']['Valor']), "currency_id": "BRL"
        })

        order_id = str(uuid.uuid4())

        preference_data = {
            "items": items_list,
            "payer": {"email": data['customerInfo']['email']},
            "back_urls": {
                "success": f"{request.host_url}payment-success.html?order_id={order_id}",
                "failure": f"{request.host_url}payment-failure.html?order_id={order_id}",
                "pending": f"{request.host_url}payment-pending.html?order_id={order_id}"
            },
            "auto_return": "approved",
            "external_reference": order_id
        }
        
        preference_result = sdk.preference().create(preference_data)
        if preference_result["status"] != 201:
            return jsonify(preference_result["response"]), preference_result["status"]

        preference = preference_result["response"]

        order_payload = {
            "mp_preference_id": preference["id"],
            "items": data['cartItems'],
            "customer_info": data['customerInfo'],
            "shipping_info": data['shippingOption'],
            "status": "pending",
            "created_at": datetime.now()
        }
        db.collection("orders").document(order_id).set(order_payload)
        
        return jsonify(preference)
    except Exception as e:
        return jsonify({"message": str(e)}), 500

# --- CORREÇÃO: Bloco de Execução comentado para a Vercel ---
# A Vercel gere a execução do servidor, este bloco é apenas para desenvolvimento local.
# if __name__ == '__main__':
#     port = int(os.environ.get('PORT', 5000))
#     app.run(debug=True, host='0.0.0.0', port=port)
