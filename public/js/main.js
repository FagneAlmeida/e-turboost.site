import { firebasePromise } from '/js/app-init.js';

firebasePromise.then(({ auth, db }) => {
    main(auth, db);
}).catch(error => {
    console.error("Falha na inicialização do Firebase:", error);
});

function main(auth, db) {
    document.addEventListener('DOMContentLoaded', () => {
        // --- ELEMENTOS DO DOM ---
        const productGrid = document.getElementById('product-grid');
        const brandSelect = document.getElementById('brand-select');
        const modelSelect = document.getElementById('model-select');
        const yearSelect = document.getElementById('year-select');
        const searchButton = document.getElementById('search-button');
        const searchResultsSection = document.getElementById('search-results-section');
        const searchResultsGrid = document.getElementById('search-results-grid');
        const mainContent = document.getElementById('main-content');
        const infoModalOverlay = document.getElementById('info-modal-overlay');
        const infoModal = document.getElementById('info-modal');
        const infoModalTitle = document.getElementById('info-modal-title');
        const infoModalContent = document.getElementById('info-modal-content');
        const closeInfoModalBtn = document.getElementById('close-info-modal-btn');
        const contactInfoFooter = document.getElementById('contact-info-footer');
        const socialLinksFooter = document.getElementById('social-links-footer');
        const headerLogo = document.getElementById('header-logo');
        const footerLogo = document.getElementById('footer-logo');

        // --- ESTADO DA APLICAÇÃO ---
        let allProducts = [];
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

        // --- FUNÇÕES DE UI ---
        const openModal = (overlay, modal) => { /* ... (código existente) ... */ };
        const closeModal = (overlay, modal) => { /* ... (código existente) ... */ };

        const openInfoModal = async (pageType) => {
            // ... (código existente) ...
        };
        
        // --- LÓGICA DE BUSCA/FILTRO ---
        const populateSearchFilters = () => { /* ... (código existente) ... */ };
        const renderSearchResults = (productsToRender) => { /* ... (código existente) ... */ };
        const performSearch = async () => { /* ... (código existente) ... */ };

        // --- CARREGAMENTO INICIAL DE DADOS ---
        const loadInitialData = async () => {
            try {
                const [productsResponse, settingsResponse] = await Promise.all([
                    fetch('/api/products'),
                    fetch('/api/settings')
                ]);

                if (productsResponse.ok) {
                    allProducts = await productsResponse.json();
                    const bestSellers = allProducts.filter(p => p.isFeatured);
                    renderProducts(bestSellers, productGrid); // Renderiza destaques
                    populateSearchFilters();
                }

                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    // Preenche logos
                    if (settings.logoUrl) {
                        headerLogo.src = settings.logoUrl;
                        footerLogo.src = settings.logoUrl;
                    }
                    // Preenche informações de contato
                    contactInfoFooter.innerHTML = '';
                    if (settings.contact_email) contactInfoFooter.innerHTML += `<li><a href="mailto:${settings.contact_email}" class="hover:text-yellow-400">${settings.contact_email}</a></li>`;
                    if (settings.contact_phone) contactInfoFooter.innerHTML += `<li><a href="tel:${settings.contact_phone}" class="hover:text-yellow-400">${settings.contact_phone}</a></li>`;
                    
                    // Preenche redes sociais
                    socialLinksFooter.innerHTML = '';
                    if (settings.social_instagram) socialLinksFooter.innerHTML += `<a href="${settings.social_instagram}" target="_blank" class="hover:text-yellow-400">Instagram</a>`;
                    if (settings.social_facebook) socialLinksFooter.innerHTML += `<a href="${settings.social_facebook}" target="_blank" class="hover:text-yellow-400">Facebook</a>`;
                }
            } catch (error) {
                console.error("Erro ao carregar dados iniciais:", error);
            }
        };

        // --- EVENT LISTENERS ---
        searchButton.addEventListener('click', performSearch);
        
        document.body.addEventListener('click', (e) => {
            const infoTrigger = e.target.closest('.info-modal-trigger');
            if (infoTrigger) {
                e.preventDefault();
                openInfoModal(infoTrigger.dataset.modalType);
            }
            // ... (outros listeners de clique)
        });

        // ... (restante dos listeners)
        
        loadInitialData();
    });
}
