import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Inicializa o Firebase com a configuração injetada pelo backend no HTML
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // Elementos da interface
    const showLoginBtn = document.getElementById('show-login-btn');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // Função para alternar entre os formulários de login e registo
    const toggleForms = (showLogin) => {
        loginView.classList.toggle('hidden', !showLogin);
        registerView.classList.toggle('hidden', showLogin);
        
        showLoginBtn.classList.toggle('text-yellow-400', showLogin);
        showLoginBtn.classList.toggle('border-yellow-400', showLogin);
        showRegisterBtn.classList.toggle('text-yellow-400', !showLogin);
        showRegisterBtn.classList.toggle('border-yellow-400', !showLogin);
    };

    showLoginBtn.addEventListener('click', () => toggleForms(true));
    showRegisterBtn.addEventListener('click', () => toggleForms(false));

    // Lógica do formulário de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        try {
            await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value);
            window.location.href = '/'; // Redireciona para a página inicial após o login
        } catch (error) {
            loginError.textContent = 'Email ou senha inválidos.';
            console.error('Erro de login:', error);
        }
    });

    // Lógica do formulário de registo
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        try {
            await createUserWithEmailAndPassword(auth, registerForm.email.value, registerForm.password.value);
            window.location.href = '/'; // Redireciona para a página inicial após o registo
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                registerError.textContent = 'Este email já está em uso.';
            } else {
                registerError.textContent = 'Erro ao criar conta. Verifique os dados.';
            }
            console.error('Erro de registo:', error);
        }
    });
});
