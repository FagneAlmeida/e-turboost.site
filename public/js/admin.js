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

    // --- FUNÇÕES DE API ---
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
        // ... (outras funções da api como put, delete)
    };

    // --- LÓGICA DE CARREGAMENTO DE DADOS ---
    const loadSettings = async () => {
        try {
            const settings = await api.get('/api/settings');
            // ... (código para preencher logo, favicon, endereço)

            // Carrega o conteúdo das páginas dinâmicas
            pageEditors.forEach(async (editor) => {
                const pageName = editor.dataset.pageName;
                if (pageName) {
                    try {
                        const pageData = await api.get(`/api/pages/${pageName}`);
                        if (pageData && pageData.content) {
                            editor.value = pageData.content;
                        }
                    } catch (error) {
                        console.warn(`Não foi possível carregar o conteúdo para a página: ${pageName}`);
                    }
                }
            });

        } catch (error) { console.error("Erro ao carregar configurações:", error); }
    };

    const loadInitialData = () => {
        // ... (chama loadProducts, loadOrders, loadSettings)
    };

    // --- MANIPULADORES DE EVENTOS (EVENT HANDLERS) ---
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Salva as configurações gerais (logo, etc.)
        const formData = new FormData(settingsForm);
        // ... (lógica para remover ficheiros vazios)
        const settingsResponse = await api.post('/api/settings', formData, false);
        showNotification('Configurações', settingsResponse.message);

        // Salva o conteúdo de cada página
        for (const editor of pageEditors) {
            const pageName = editor.dataset.pageName;
            const content = editor.value;
            try {
                await api.post(`/api/admin/pages/${pageName}`, { content });
            } catch (error) {
                console.error(`Falha ao salvar a página ${pageName}:`, error);
                showNotification('Erro', `Não foi possível salvar a página ${pageName}.`);
            }
        }
        
        loadSettings(); // Recarrega as configurações para garantir consistência
    });

    // ... (restante do código: autenticação, navegação, modais, renderização, etc.)
    // O código anterior permanece funcional e inalterado.

    // --- INICIALIZAÇÃO ---
    checkAdminStatus();
});
