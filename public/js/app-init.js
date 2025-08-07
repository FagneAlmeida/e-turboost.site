// public/js/app-init.js

/**
 * Este script centraliza a inicialização segura do Firebase usando a sintaxe modular (v9+).
 * Ele busca a configuração do backend e exporta uma promessa com as instâncias dos serviços.
 */

// Importa as funções necessárias do SDK do Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Variável para garantir que a inicialização ocorra apenas uma vez.
let firebasePromiseInstance = null;

// Token de autorização (hardcoded para teste local - substitua por variável de ambiente em produção)
const API_AUTH_TOKEN = "Tbst-AP1-tK_2o25_sEcUr3_gHjK9lM0nOpQrStUvWxYz"; // Do .env

async function fetchFirebaseConfig() {
    try {
        const response = await fetch('/api/firebase-config', {
            headers: {
                'Authorization': `Bearer ${API_AUTH_TOKEN}`
            }
        });
        if (!response.ok) {
            throw new Error(`Erro de rede ao buscar configuração: ${response.statusText}`);
        }
        const config = await response.json();
        if (config.error) {
            throw new Error(config.error);
        }
        return config;
    } catch (error) {
        console.error("Falha ao buscar a configuração do Firebase:", error);
        throw error;
    }
}

function initializeFirebase() {
    if (firebasePromiseInstance) {
        return firebasePromiseInstance;
    }

    firebasePromiseInstance = (async () => {
        try {
            const firebaseConfig = await fetchFirebaseConfig();
            
            // Inicializa a aplicação Firebase com a sintaxe v9+
            const app = initializeApp(firebaseConfig);
            
            // Obtém as instâncias dos serviços com a sintaxe v9+
            const auth = getAuth(app);
            const db = getFirestore(app);
            
            console.log("Firebase v9+ inicializado de forma segura e centralizada.");
            
            return { app, auth, db };

        } catch (error) {
            console.error("FALHA CRÍTICA: Não foi possível inicializar o Firebase.", error);
            
            document.body.innerHTML = `
                <div class="bg-primary text-text-light flex flex-col items-center justify-center h-screen p-4">
                    <h1 class="font-anton text-3xl text-detail mb-4">Erro de Conexão</h1>
                    <p class="text-text-muted text-center">Não foi possível conectar aos nossos serviços. Por favor, tente novamente mais tarde.</p>
                </div>`;
            
            return Promise.reject(error);
        }
    })();

    return firebasePromiseInstance;
}

// Exporta a promessa para ser usada em outros módulos (main.js, checkout.js, etc.)
export const firebasePromise = initializeFirebase();