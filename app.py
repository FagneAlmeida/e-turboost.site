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

# ... (código de inicialização e decorators existentes) ...

# --- ROTAS DE API PÚBLICAS ---
# ... (rotas públicas existentes: /api/firebase-config, /api/products, /api/products/search, /api/pages/<page_name>, etc.) ...

# --- ROTAS DE ADMINISTRAÇÃO ---
# ... (rotas de admin existentes: login, logout, session, check, CRUD de produtos, pedidos) ...

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

        # Upload de imagens (logo e favicon)
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

        # A flexibilidade do merge=True permite salvar os novos campos (contact_email, social_instagram, etc.) sem alterar o código.
        settings_ref.set(data, merge=True)
        return jsonify({"message": "Configurações salvas com sucesso!"}), 200
    except Exception as e:
        logging.error(f"Erro ao salvar configurações: {e}")
        return jsonify({"error": "Ocorreu um erro interno ao salvar as configurações."}), 500

# ... (outras rotas de admin) ...

# --- Bloco de Execução ---
if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
