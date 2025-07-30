// O painel de admin permanece isolado do app-init.js, mas com lógica interna melhorada.

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const authModalOverlay = document.getElementById('auth-modal-overlay');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const mainContent = document.getElementById('main-content');
    const logoutBtn = document.getElementById('logout-btn');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const contentSections = document.querySelectorAll('.content-section');
    const totalProductsEl = document.getElementById('total-products');
    const productListEl = document.getElementById('product-list');
    const settingsForm = document.getElementById('settings-form');
    const addProductBtn = document.getElementById('add-product-btn');
    const productModalOverlay = document.getElementById('product-modal-overlay');
    const productForm = document.getElementById('product-form');
    const cancelProductBtn = document.getElementById('cancel-product-btn');
    const modalTitle = document.getElementById('modal-title');
    const adminLogo = document.getElementById('admin-logo');

    // --- CORREÇÃO: Elementos para o modal de notificação ---
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationConfirmBtn = document.getElementById('notification-confirm-btn');
    const notificationCancelBtn = document.getElementById('notification-cancel-btn');

    let allProducts = [];
    let confirmCallback = null;

    // --- CORREÇÃO: Funções de Modal para substituir alert() e confirm() ---
    const showNotification = (title, message, showConfirm = false) => {
        notificationTitle.textContent = title;
        notificationMessage.textContent = message;
        notificationConfirmBtn.classList.toggle('hidden', !showConfirm);
        notificationCancelBtn.textContent = showConfirm ? 'Cancelar' : 'Fechar';
        notificationModal.classList.add('open');
    };

    const hideNotification = () => {
        notificationModal.classList.remove('open');
        confirmCallback = null;
    };

    const confirmAction = (title, message, callback) => {
        showNotification(title, message, true);
        confirmCallback = callback;
    };

    // --- FUNÇÕES DE API (com tratamento de erros) ---
    const api = {
        get: async (endpoint) => {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`Erro na API: ${res.statusText}`);
            return res.json();
        },
        post: async (endpoint, body, isJson = true) => {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: isJson ? { 'Content-Type': 'application/json' } : {},
                body: isJson ? JSON.stringify(body) : body,
            });
            return res.json();
        },
        put: async (endpoint, body) => {
            const res = await fetch(endpoint, { method: 'PUT', body });
            return res.json();
        },
        delete: async (endpoint) => {
            const res = await fetch(endpoint, { method: 'DELETE' });
            return res.json();
        },
    };

    // --- AUTENTICAÇÃO ---
    const checkAdminStatus = async () => {
        try {
            // Primeiro, verifica se já existe uma sessão ativa
            const sessionData = await api.get('/api/check-session');
            if (sessionData.logged_in) {
                authModalOverlay.classList.remove('open');
                mainContent.classList.remove('hidden');
                loadInitialData();
                return;
            }

            // Se não houver sessão, verifica se um admin existe para mostrar login ou registo
            const adminData = await api.get('/api/check-admin');
            loginView.classList.toggle('hidden', !adminData.adminExists);
            registerView.classList.toggle('hidden', adminData.adminExists);
            authModalOverlay.classList.add('open');

        } catch (error) {
            showNotification("Erro de Conexão", "Não foi possível conectar ao servidor. Tente novamente mais tarde.");
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const data = await api.post('/login', {
            username: loginForm.username.value,
            password: loginForm.password.value
        });
        if (data.message === 'Login bem-sucedido.') {
            window.location.reload(); // Recarrega para obter o estado de login correto
        } else {
            loginError.textContent = data.message || 'Erro desconhecido.';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        const data = await api.post('/api/register', {
            username: registerForm['reg-username'].value,
            password: registerForm['reg-password'].value
        });
        if (data.message === 'Administrador registado com sucesso.') {
            showNotification('Sucesso', 'Administrador registado! Faça login para continuar.');
            checkAdminStatus();
        } else {
            registerError.textContent = data.message || 'Erro desconhecido.';
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await api.post('/logout', {});
        window.location.reload();
    });

    // --- NAVEGAÇÃO E CARREGAMENTO DE DADOS ---
    sidebarLinks.forEach(link => {
        if (!link.id || link.id !== 'logout-btn') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                contentSections.forEach(s => s.classList.add('hidden'));
                document.getElementById(link.dataset.section).classList.remove('hidden');
            });
        }
    });
    
    const loadInitialData = () => {
        loadProducts();
        loadSettings();
    };

    const loadProducts = async () => {
        try {
            allProducts = await api.get('/api/products');
            totalProductsEl.textContent = allProducts.length;
            renderProducts();
        } catch (error) { console.error("Erro ao carregar produtos:", error); }
    };

    const loadSettings = async () => {
        try {
            const settings = await api.get('/api/settings');
            Object.keys(settings).forEach(key => {
                const input = settingsForm.elements[key];
                if (input) input.value = settings[key];
            });
            if (settings.logoUrl) {
                document.getElementById('logo-preview').src = settings.logoUrl;
                document.getElementById('logo-preview').classList.remove('hidden');
                adminLogo.src = settings.logoUrl;
            }
        } catch (error) { console.error("Erro ao carregar configurações:", error); }
    };

    // --- RENDERIZAÇÃO ---
    const renderProducts = () => {
        productListEl.innerHTML = allProducts.map(product => `
            <div class="p-4 space-y-3 bg-gray-900 rounded-lg">
                <img src="${product.imagemURL1 || 'https://placehold.co/600x400/1a1a1a/FFC700?text=IMG'}" class="object-cover w-full h-40 rounded-md">
                <h3 class="text-xl font-bold truncate">${product.nomeProduto}</h3>
                <p class="text-lg font-semibold text-accent">R$ ${product.preco ? product.preco.toFixed(2).replace('.', ',') : '0,00'}</p>
                <div class="flex justify-end gap-2 pt-2 border-t border-gray-700">
                    <button data-id="${product.id}" class="edit-btn btn btn-outline">Editar</button>
                    <button data-id="${product.id}" class="delete-btn btn btn-danger">Eliminar</button>
                </div>
            </div>
        `).join('');
    };

    // --- MANIPULAÇÃO DE FORMULÁRIOS E MODAIS ---
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(settingsForm);
        // --- CORREÇÃO: Validação de ficheiros ---
        const logoFile = formData.get('logoFile');
        if (logoFile && logoFile.size === 0) formData.delete('logoFile');
        
        const faviconFile = formData.get('faviconFile');
        if (faviconFile && faviconFile.size === 0) formData.delete('faviconFile');

        const data = await api.post('/api/settings', formData, false);
        showNotification('Configurações', data.message);
        loadSettings();
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(productForm);
        const productId = formData.get('productId');

        // --- CORREÇÃO: Validação de campos obrigatórios ---
        if (!formData.get('nomeProduto') || !formData.get('preco')) {
            showNotification('Erro de Validação', 'Nome do Produto e Preço são campos obrigatórios.');
            return;
        }

        try {
            const response = productId 
                ? await api.put(`/api/products/${productId}`, formData) 
                : await api.post('/api/products', formData, false);
            
            showNotification('Produtos', response.message);
            if (!response.error) {
                closeProductModal();
                loadProducts();
            }
        } catch (error) {
            showNotification("Erro", "Ocorreu um erro ao salvar o produto.");
        }
    });

    const openProductModal = (product = null) => {
        productForm.reset();
        modalTitle.textContent = product ? 'Editar Produto' : 'Adicionar Novo Produto';
        if (product) {
            Object.keys(product).forEach(key => {
                const input = productForm.elements[key];
                if (input) {
                    if(input.type === 'checkbox') input.checked = product[key];
                    else input.value = Array.isArray(product[key]) ? product[key].join(', ') : product[key];
                }
            });
            productForm.elements.productId.value = product.id;
        }
        productModalOverlay.classList.add('open');
    };

    const closeProductModal = () => productModalOverlay.classList.remove('open');

    addProductBtn.addEventListener('click', () => openProductModal());
    cancelProductBtn.addEventListener('click', closeProductModal);
    
    productListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const productId = btn.dataset.id;
        if (btn.classList.contains('edit-btn')) {
            openProductModal(allProducts.find(p => p.id === productId));
        } else if (btn.classList.contains('delete-btn')) {
            confirmAction('Eliminar Produto', 'Tem a certeza que quer eliminar este produto? Esta ação não pode ser desfeita.', async () => {
                const data = await api.delete(`/api/products/${productId}`);
                showNotification('Produtos', data.message);
                loadProducts();
                hideNotification();
            });
        }
    });

    // Listeners do modal de notificação
    notificationCancelBtn.addEventListener('click', hideNotification);
    notificationConfirmBtn.addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
    });

    // --- INICIALIZAÇÃO ---
    checkAdminStatus();
});
