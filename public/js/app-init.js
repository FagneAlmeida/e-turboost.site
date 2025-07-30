// public/js/app-init.js

/**
 * Este script centraliza a inicialização segura do Firebase.
 * Ele busca a configuração do backend e exporta uma promessa com as instâncias do Firebase.
 */

let firebaseApp;

async function fetchFirebaseConfig() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error(`Erro de rede ao buscar configuração: ${response.statusText}`);
        const config = await response.json();
        if (config.error) throw new Error(config.error);
        return config;
    } catch (error) {
        console.error("Falha ao buscar a configuração do Firebase:", error);
        throw error;
    }
}

async function initializeFirebase() {
    if (firebaseApp) {
        return {
            app: firebaseApp,
            auth: firebase.auth(),
            db: firebase.firestore(),
            storage: firebase.storage()
        };
    }

    try {
        const firebaseConfig = await fetchFirebaseConfig();
        firebaseApp = firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();
        const storage = firebase.storage();
        console.log("Firebase inicializado de forma segura e centralizada.");
        return { app: firebaseApp, auth, db, storage };
    } catch (error) {
        console.error("FALHA CRÍTICA: Não foi possível inicializar o Firebase.", error);
        document.body.innerHTML = `<div style="color: red; text-align: center; padding: 40px; background-color: #1a1a1a; height: 100vh;"><h1>Erro de Conexão</h1><p>Não foi possível conectar aos nossos serviços. Por favor, tente novamente mais tarde.</p></div>`;
        throw error;
    }
}

export const firebasePromise = initializeFirebase();