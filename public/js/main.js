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
        let allProducts = []; // Mantido para outras funcionalidades se necessário
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

        // --- FUNÇÕES DE UI ---
        const openModal = (overlay, modal) => { /* ... (código existente) ... */ };
        const closeModal = (overlay, modal) => { /* ... (código existente) ... */ };
        const openInfoModal = async (pageType) => { /* ... (código existente) ... */ };
        const renderProducts = (productsToRender, gridElement) => { /* ... (código existente) ... */ };

        // --- LÓGICA DE BUSCA/FILTRO (REATORADA) ---
        const populateSearchFilters = () => { /* ... (código existente) ... */ };
        
        /**
         * Executa a busca de produtos no servidor com base nos filtros selecionados.
         * Esta função foi refatorada para usar o endpoint da API em vez de filtrar localmente.
         */
        const performSearch = async () => {
            const marca = brandSelect.value;
            const modelo = modelSelect.value;
            const ano = yearSelect.value;

            // Mostra um feedback de carregamento para o utilizador
            searchResultsGrid.innerHTML = '<p class="text-center text-white col-span-full">A procurar...</p>';
            mainContent.classList.add('hidden');
            searchResultsSection.classList.remove('hidden');

            // Constrói os parâmetros de busca. URLSearchParams lida com a codificação.
            const params = new URLSearchParams();
            if (marca) params.append('marca', marca);
            if (modelo) params.append('modelo', modelo);
            if (ano) params.append('ano', ano);
            
            // Constrói a URL final da API
            const apiUrl = `/api/products/search?${params.toString()}`;

            try {
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`Erro na API: ${response.statusText}`);
                }
                const products = await response.json();

                // Limpa o grid antes de renderizar os novos resultados
                searchResultsGrid.innerHTML = ''; 

                if (products.length > 0) {
                    renderProducts(products, searchResultsGrid);
                } else {
                    searchResultsGrid.innerHTML = '<p class="text-center text-white col-span-full">Nenhum produto encontrado com os filtros selecionados.</p>';
                }

            } catch (error) {
                console.error("Erro ao realizar a busca:", error);
                searchResultsGrid.innerHTML = '<p class="text-center text-red-400 col-span-full">Ocorreu um erro ao buscar os produtos. Por favor, tente novamente.</p>';
            }
        };

        // --- CARREGAMENTO INICIAL DE DADOS ---
        const loadInitialData = async () => {
            try {
                // A rota /api/products ainda pode ser usada para carregar destaques, por exemplo
                const [productsResponse, settingsResponse] = await Promise.all([
                    fetch('/api/products'), // Ajuste: talvez buscar apenas destaques? Ex: /api/products?featured=true
                    fetch('/api/settings')
                ]);

                if (productsResponse.ok) {
                    allProducts = await productsResponse.json();
                    const bestSellers = allProducts.filter(p => p.isFeatured);
                    renderProducts(bestSellers, productGrid); 
                    populateSearchFilters(); // Assumindo que esta função usa `allProducts` para popular os selects
                }

                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    // ... (lógica de settings inalterada) ...
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
        });
        // ... (restante dos listeners)
        
        loadInitialData();
    });
}