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

    // Elementos para o modal de notificação
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationConfirmBtn = document.getElementById('notification-confirm-btn');
    const notificationCancelBtn = document.getElementById('notification-cancel-btn');

    // Elementos para o modal de detalhes do pedido
    const orderDetailsModalOverlay = document.getElementById('order-details-modal-overlay');
    const orderModalTitle = document.getElementById('order-modal-title');
    const orderModalContent = document.getElementById('order-modal-content');
    const closeOrderModalBtn = document.getElementById('close-order-modal-btn');

    let allProducts = [];
    let allOrders = [];
    let confirmCallback = null;

    // --- Funções de Modal ---
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
            const sessionData = await api.get('/api/admin/session');
            if (sessionData.isLoggedIn) {
                authModalOverlay.classList.remove('open');
                mainContent.classList.remove('hidden');
                loadInitialData();
                return;
            }

            const adminData = await api.get('/api/admin/check');
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
        const data = await api.post('/api/admin/login', {
            username: loginForm.username.value,
            password: loginForm.password.value
        });
        if (data.success) {
            window.location.reload();
        } else {
            loginError.textContent = data.error || 'Erro desconhecido.';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';
        const data = await api.post('/api/admin/register', {
            username: registerForm['reg-username'].value,
            password: registerForm['reg-password'].value
        });
        if (data.success) {
            showNotification('Sucesso', 'Administrador registado! Faça login para continuar.');
            checkAdminStatus();
        } else {
            registerError.textContent = data.error || 'Erro desconhecido.';
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await api.post('/api/admin/logout', {});
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
        loadOrders();
        loadSettings();
    };

    const loadProducts = async () => {
        try {
            allProducts = await api.get('/api/products');
            totalProductsEl.textContent = allProducts.length;
            renderProducts();
        } catch (error) { console.error("Erro ao carregar produtos:", error); }
    };

    const loadOrders = async () => {
        try {
            allOrders = await api.get('/api/admin/orders');
            totalOrdersEl.textContent = allOrders.length;
            renderOrders();
        } catch (error) { console.error("Erro ao carregar pedidos:", error); }
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

    const renderOrders = () => {
        if (allOrders.length === 0) {
            orderListEl.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum pedido encontrado.</td></tr>';
            return;
        }
        orderListEl.innerHTML = allOrders.map(order => {
            const orderDate = new Date(order.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const statusClass = order.status === 'approved' ? 'text-green-400' : 'text-yellow-400';
            
            return `
                <tr class="border-b border-gray-700 hover:bg-gray-900">
                    <td class="p-4">${orderDate}</td>
                    <td class="p-4">${order.payer?.email || 'N/A'}</td>
                    <td class="p-4 font-semibold">R$ ${order.total ? order.total.toFixed(2).replace('.', ',') : '0,00'}</td>
                    <td class="p-4 font-bold ${statusClass}">${order.status || 'Pendente'}</td>
                    <td class="p-4">
                        <button data-id="${order.id}" class="view-order-btn text-accent hover:underline">Ver Detalhes</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // --- MANIPULAÇÃO DE FORMULÁRIOS E MODAIS ---
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(settingsForm);
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

    const openOrderDetailsModal = (order) => {
        orderModalTitle.textContent = `Detalhes do Pedido #${order.id.substring(0, 8)}`;
        
        const itemsHtml = order.items.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-gray-700">
                <span>${item.quantity}x ${item.name}</span>
                <span>R$ ${item.price.toFixed(2).replace('.', ',')}</span>
            </div>
        `).join('');

        const payer = order.payer || {};
        
        orderModalContent.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 class="font-bold text-lg mb-2 text-accent">Itens Comprados</h3>
                    <div class="space-y-2">${itemsHtml}</div>
                    <div class="flex justify-between font-bold text-lg mt-2 pt-2 border-t border-gray-500">
                        <span>Total:</span>
                        <span>R$ ${order.total.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-lg mb-2 text-accent">Dados do Cliente</h3>
                    <p><strong>Nome:</strong> ${payer.name || 'N/A'}</p>
                    <p><strong>Email:</strong> ${payer.email || 'N/A'}</p>
                    <p><strong>Telefone:</strong> ${payer.phone?.area_code || ''} ${payer.phone?.number || ''}</p>
                    <p><strong>Documento:</strong> ${payer.identification?.type || ''} ${payer.identification?.number || ''}</p>
                </div>
            </div>
        `;
        orderDetailsModalOverlay.classList.add('open');
    };

    const closeOrderDetailsModal = () => {
        orderDetailsModalOverlay.classList.remove('open');
    };

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

    orderListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-order-btn');
        if (btn) {
            const orderId = btn.dataset.id;
            const order = allOrders.find(o => o.id === orderId);
            if (order) {
                openOrderDetailsModal(order);
            }
        }
    });

    // Listeners dos modais
    notificationCancelBtn.addEventListener('click', hideNotification);
    notificationConfirmBtn.addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
    });
    closeOrderModalBtn.addEventListener('click', closeOrderDetailsModal);
    orderDetailsModalOverlay.addEventListener('click', (e) => {
        if (e.target === orderDetailsModalOverlay) {
            closeOrderDetailsModal();
        }
    });

    // --- INICIALIZAÇÃO ---
    checkAdminStatus();
});
