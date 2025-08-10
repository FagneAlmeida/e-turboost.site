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
    const totalOrdersEl = document.getElementById('total-orders');
    const productListEl = document.getElementById('product-list');
    const orderListEl = document.getElementById('order-list');
    const settingsForm = document.getElementById('settings-form');
    const addProductBtn = document.getElementById('add-product-btn');
    const productModalOverlay = document.getElementById('product-modal-overlay');
    const productForm = document.getElementById('product-form');
    const cancelProductBtn = document.getElementById('cancel-product-btn');
    const modalTitle = document.getElementById('modal-title');
    const adminLogo = document.getElementById('admin-logo');
    const pageEditors = document.querySelectorAll('.page-editor');

    // Modais
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationConfirmBtn = document.getElementById('notification-confirm-btn');
    const notificationCancelBtn = document.getElementById('notification-cancel-btn');
    const orderDetailsModalOverlay = document.getElementById('order-details-modal-overlay');
    const orderModalTitle = document.getElementById('order-modal-title');
    const orderModalContent = document.getElementById('order-modal-content');
    const closeOrderModalBtn = document.getElementById('close-order-modal-btn');

    // --- ESTADO DA APLICAÇÃO ---
    let allProducts = [];
    let allOrders = [];
    let confirmCallback = null;

    // --- FUNÇÕES DE MODAL ---
    const showNotification = (title, message, showConfirm = false) => {
        if (!notificationModal) return;
        notificationTitle.textContent = title;
        notificationMessage.textContent = message;
        notificationConfirmBtn.classList.toggle('hidden', !showConfirm);
        notificationCancelBtn.textContent = showConfirm ? 'Cancelar' : 'Fechar';
        notificationModal.classList.add('flex');
        notificationModal.classList.remove('hidden');
    };

    const hideNotification = () => {
        if (!notificationModal) return;
        notificationModal.classList.add('hidden');
        notificationModal.classList.remove('flex');
        confirmCallback = null;
    };

    const confirmAction = (title, message, callback) => {
        showNotification(title, message, true);
        confirmCallback = callback;
    };

    // --- FUNÇÕES DE API ---
    const api = {
        get: async (endpoint) => {
            const res = await fetch(endpoint);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(errorData.error || `Erro na API: ${res.statusText}`);
            }
            return res.json();
        },
        post: async (endpoint, body, isJson = true) => {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: isJson ? { 'Content-Type': 'application/json' } : {},
                body: isJson ? JSON.stringify(body) : body,
            });
            const responseData = await res.json();
            if (!res.ok) throw new Error(responseData.error || 'Erro desconhecido ao enviar dados.');
            return responseData;
        },
        put: async (endpoint, body) => {
             const res = await fetch(endpoint, {
                method: 'PUT',
                body: body
            });
            const responseData = await res.json();
            if (!res.ok) throw new Error(responseData.error || 'Erro desconhecido ao atualizar dados.');
            return responseData;
        },
        delete: async (endpoint) => {
            const res = await fetch(endpoint, { method: 'DELETE' });
            const responseData = await res.json();
            if (!res.ok) throw new Error(responseData.error || 'Erro desconhecido ao eliminar dados.');
            return responseData;
        },
    };

    // --- AUTENTICAÇÃO ---
    const checkAdminStatus = async () => {
        try {
            const sessionData = await api.get('/api/admin/session');
            if (sessionData.isLoggedIn) {
                if(authModalOverlay) {
                    authModalOverlay.classList.remove('flex');
                    authModalOverlay.classList.add('hidden');
                }
                if(mainContent) mainContent.classList.remove('hidden');
                loadInitialData();
                return;
            }

            const adminData = await api.get('/api/admin/check');
            if(loginView) loginView.classList.toggle('hidden', !adminData.adminExists);
            if(registerView) registerView.classList.toggle('hidden', adminData.adminExists);
            if(authModalOverlay) {
                authModalOverlay.classList.remove('hidden');
                authModalOverlay.classList.add('flex');
            }

        } catch (error) {
            showNotification("Erro de Conexão", "Não foi possível conectar ao servidor. Tente novamente mais tarde.");
        }
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(loginError) loginError.textContent = '';
            try {
                const data = await api.post('/api/admin/login', {
                    username: loginForm.username.value,
                    password: loginForm.password.value
                });
                if (data.success) {
                    window.location.reload();
                }
            } catch (error) {
                if(loginError) loginError.textContent = error.message || 'Erro desconhecido.';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(registerError) registerError.textContent = '';
            try {
                const data = await api.post('/api/admin/register', {
                    username: registerForm['reg-username'].value,
                    password: registerForm['reg-password'].value
                });
                if (data.success) {
                    showNotification('Sucesso', 'Administrador registado! Faça login para continuar.');
                    checkAdminStatus();
                }
            } catch (error) {
                if(registerError) registerError.textContent = error.message || 'Erro desconhecido.';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await api.post('/api/admin/logout', {});
            window.location.reload();
        });
    }
    
    // --- NAVEGAÇÃO E CARREGAMENTO DE DADOS ---
    sidebarLinks.forEach(link => {
        if (!link.closest('button')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                contentSections.forEach(s => s.classList.add('hidden'));
                const section = document.getElementById(link.dataset.section);
                if(section) section.classList.remove('hidden');
            });
        }
    });
    
    const loadInitialData = () => {
        loadProducts();
        loadOrders();
        loadSettings();
    };

    const loadProducts = async () => {
        try {
            allProducts = await api.get('/api/products');
            if(totalProductsEl) totalProductsEl.textContent = allProducts.length;
            renderProducts();
        } catch (error) { console.error("Erro ao carregar produtos:", error); }
    };

    const loadOrders = async () => {
        try {
            allOrders = await api.get('/api/admin/orders');
            if(totalOrdersEl) totalOrdersEl.textContent = allOrders.length;
            renderOrders();
        } catch (error) { console.error("Erro ao carregar pedidos:", error); }
    };

    const loadSettings = async () => {
        try {
            const settings = await api.get('/api/settings');
            Object.keys(settings).forEach(key => {
                if (settingsForm && settingsForm.elements[key]) {
                    settingsForm.elements[key].value = settings[key];
                }
            });
            if (settings.logoUrl) {
                const logoPreview = document.getElementById('logo-preview');
                if(logoPreview) {
                    logoPreview.src = settings.logoUrl;
                    logoPreview.classList.remove('hidden');
                }
                if(adminLogo) adminLogo.src = settings.logoUrl;
            }

            for (const editor of pageEditors) {
                const pageName = editor.dataset.pageName;
                if (pageName) {
                    try {
                        const pageData = await api.get(`/api/pages/${pageName}`);
                        if (pageData && pageData.content) {
                            editor.value = pageData.content;
                        }
                    } catch (error) {
                        console.warn(`Conteúdo para a página '${pageName}' ainda não definido.`);
                    }
                }
            }
        } catch (error) { console.error("Erro ao carregar configurações:", error); }
    };

    // --- RENDERIZAÇÃO ---
    const renderProducts = () => { /* ... (código completo aqui) ... */ };
    const renderOrders = () => { /* ... (código completo aqui) ... */ };

    // --- MANIPULADORES DE EVENTOS ---
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const formData = new FormData(settingsForm);
                const logoFile = formData.get('logoFile');
                if (logoFile && logoFile.size === 0) formData.delete('logoFile');
                const faviconFile = formData.get('faviconFile');
                if (faviconFile && faviconFile.size === 0) formData.delete('faviconFile');

                await api.post('/api/settings', formData, false);
                
                for (const editor of pageEditors) {
                    const pageName = editor.dataset.pageName;
                    const content = editor.value;
                    await api.post(`/api/admin/pages/${pageName}`, { content });
                }

                showNotification('Sucesso', 'Todas as configurações foram salvas!');
                loadSettings();
            } catch (error) {
                showNotification('Erro', error.message);
            }
        });
    }

    // ... (restante do código: productForm, modais, listeners de botões, etc.)

    // --- INICIALIZAÇÃO ---
    checkAdminStatus();
});
