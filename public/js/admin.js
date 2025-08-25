import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const authModalOverlay = document.getElementById('auth-modal-overlay');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const showRegisterViewBtn = document.getElementById('show-register-view-btn');
    const showLoginViewBtn = document.getElementById('show-login-view-btn');
    const loginPasswordInput = document.getElementById('login-password');
    const toggleLoginPasswordBtn = document.getElementById('toggle-login-password');
    const registerPasswordInput = document.getElementById('register-password');
    const toggleRegisterPasswordBtn = document.getElementById('toggle-register-password');
    const mainContent = document.getElementById('main-content');
    const logoutBtn = document.getElementById('logout-btn');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const contentSections = document.querySelectorAll('.content-section');
    const productListEl = document.getElementById('product-list');
    const addProductBtn = document.getElementById('add-product-btn');
    const productModalOverlay = document.getElementById('product-modal-overlay');
    const productForm = document.getElementById('product-form');
    const cancelProductBtn = document.getElementById('cancel-product-btn');
    const modalTitle = document.getElementById('modal-title');
    const imageUploadInput = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const settingsForm = document.getElementById('settings-form');

    // --- ESTADO DA APLICAÇÃO ---
    let currentUser = null;
    let allProducts = [];
    let editingProductId = null;

    // --- ÍCONES SVG ---
    const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`;
    const eyeSlashIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064-7 9.542-7 .847 0 1.67.127 2.455.364m-6.908 6.908l-1.292-1.292M12 12a3 3 0 11-3-3m3 3l-3-3" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 1l22 22" /></svg>`;

    // --- FUNÇÕES DE API ---
    const api = {
        request: async (endpoint, options = {}) => {
            if (!currentUser) throw new Error("Utilizador não autenticado.");
            const idToken = await currentUser.getIdToken(true);
            const headers = { ...options.headers };
            if (!(options.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }
            headers['Authorization'] = `Bearer ${idToken}`;
            const config = { ...options, headers };
            const response = await fetch(endpoint, config);
            const responseData = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(responseData.error || `Erro HTTP ${response.status}`);
            return responseData;
        }
    };

    // --- LÓGICA DE UI E NAVEGAÇÃO ---
    const setupNavigation = () => {
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionId = link.dataset.section;
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                contentSections.forEach(s => s.classList.add('hidden'));
                document.getElementById(sectionId)?.classList.remove('hidden');
            });
        });
    };

    const renderProducts = () => {
        productListEl.innerHTML = '';
        allProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'bg-gray-700 rounded-lg overflow-hidden shadow-lg flex flex-col';
            card.innerHTML = `
                <img src="${product.imageUrl || 'https://placehold.co/400x300/1f2937/FFF?text=Produto'}" alt="${product.name}" class="w-full h-48 object-cover">
                <div class="p-4 flex flex-col flex-grow">
                    <h3 class="font-bold text-lg text-white">${product.name}</h3>
                    <p class="text-yellow-400 font-semibold mt-2">R$ ${product.price.toFixed(2)}</p>
                    <div class="mt-auto pt-4 flex gap-2">
                        <button class="edit-product-btn btn btn-outline w-full text-sm" data-id="${product.id}">Editar</button>
                        <button class="delete-product-btn btn btn-danger w-full text-sm" data-id="${product.id}">Excluir</button>
                    </div>
                </div>
            `;
            productListEl.appendChild(card);
        });
    };
    
    // --- GESTÃO DE DADOS ---
    const loadInitialData = async () => {
        try {
            const productsData = await api.request('/api/products');
            allProducts = productsData.products || [];
            renderProducts();
            // ... (carregar outras informações como pedidos e configurações)
        } catch (error) {
            alert("Erro ao carregar dados do painel: " + error.message);
        }
    };

    // --- LÓGICA DE AUTENTICAÇÃO ---
    const setupAuth = () => {
        toggleLoginPasswordBtn.innerHTML = eyeIcon;
        toggleRegisterPasswordBtn.innerHTML = eyeIcon;

        showRegisterViewBtn.addEventListener('click', () => {
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
        });

        showLoginViewBtn.addEventListener('click', () => {
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
        });

        const togglePasswordVisibility = (input, button) => {
            input.type = input.type === 'password' ? 'text' : 'password';
            button.innerHTML = input.type === 'password' ? eyeIcon : eyeSlashIcon;
        };

        toggleLoginPasswordBtn.addEventListener('click', () => togglePasswordVisibility(loginPasswordInput, toggleLoginPasswordBtn));
        toggleRegisterPasswordBtn.addEventListener('click', () => togglePasswordVisibility(registerPasswordInput, toggleRegisterPasswordBtn));

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.textContent = '';
            try {
                await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value);
            } catch (error) {
                loginError.textContent = "Email ou senha inválidos.";
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            registerError.textContent = '';
            try {
                await createUserWithEmailAndPassword(auth, registerForm.email.value, registerForm.password.value);
            } catch (error) {
                registerError.textContent = "Não foi possível criar a conta.";
            }
        });

        logoutBtn.addEventListener('click', () => signOut(auth));

        onAuthStateChanged(auth, (user) => {
            mainContent.classList.toggle('hidden', !user);
            authModalOverlay.classList.toggle('hidden', user);
            currentUser = user;
            if (user) {
                loadInitialData();
            }
        });
    };

    // --- LÓGICA DE EVENTOS ---
    const setupEventListeners = () => {
        addProductBtn.addEventListener('click', () => openProductModal());
        cancelProductBtn.addEventListener('click', closeProductModal);
        imageUploadInput.addEventListener('change', () => {
            const file = imageUploadInput.files[0];
            if (file) imagePreview.src = URL.createObjectURL(file);
        });

        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(productForm);
            const endpoint = editingProductId ? `/api/admin/products/${editingProductId}` : '/api/admin/products';
            const method = editingProductId ? 'PUT' : 'POST';
            try {
                const result = await api.request(endpoint, { method, body: formData });
                alert(`Produto ${editingProductId ? 'atualizado' : 'adicionado'}!`);
                closeProductModal();
                loadInitialData(); // Recarrega a lista de produtos
            } catch (error) {
                alert(`Erro ao salvar produto: ${error.message}`);
            }
        });

        productListEl.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-product-btn');
            const deleteBtn = e.target.closest('.delete-product-btn');
            if (editBtn) {
                const product = allProducts.find(p => p.id === editBtn.dataset.id);
                if (product) openProductModal(product);
            }
            if (deleteBtn) {
                if (confirm('Tem a certeza que deseja excluir este produto?')) {
                    api.request(`/api/admin/products/${deleteBtn.dataset.id}`, { method: 'DELETE' })
                        .then(() => { alert('Produto apagado!'); loadInitialData(); })
                        .catch(error => alert('Erro ao apagar: ' + error.message));
                }
            }
        });
    };

    const openProductModal = (product = null) => {
        productForm.reset();
        imagePreview.src = 'https://placehold.co/400x300/2c2c2c/FFF?text=Imagem';
        editingProductId = null;
        if (product) {
            editingProductId = product.id;
            modalTitle.textContent = 'Editar Produto';
            for (const key in product) {
                if (productForm.elements[key]) {
                    const element = productForm.elements[key];
                    if (element.type === 'checkbox') {
                        element.checked = product[key];
                    } else {
                        element.value = product[key];
                    }
                }
            }
            if (product.imageUrl) imagePreview.src = product.imageUrl;
        } else {
            modalTitle.textContent = 'Adicionar Novo Produto';
        }
        productModalOverlay.classList.remove('hidden');
    };
    const closeProductModal = () => productModalOverlay.classList.add('hidden');

    // --- INICIALIZAÇÃO ---
    setupAuth();
    setupNavigation();
    setupEventListeners();
});
