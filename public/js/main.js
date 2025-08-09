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
        // Adicione outros elementos do DOM aqui (carrinho, login, etc.)

        // --- ESTADO DA APLICAÇÃO ---
        let allProducts = [];
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

        // --- FUNÇÕES DE UI ---
        const openModal = (overlay, modal) => {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        };
        const closeModal = (overlay, modal) => {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        };

        const openInfoModal = async (pageType) => {
            const titles = {
                'about': 'Sobre Nós',
                'privacy': 'Política de Privacidade',
                'terms': 'Termos de Serviço',
                'returns': 'Trocas e Devoluções',
                'faq': 'Perguntas Frequentes'
            };
            infoModalTitle.textContent = titles[pageType] || 'Informação';
            infoModalContent.innerHTML = '<div class="loader"></div>'; // Simula um loader
            openModal(infoModalOverlay, infoModal);
            try {
                const response = await fetch(`/api/pages/${pageType}`);
                const data = await response.json();
                infoModalContent.innerHTML = data.content || `<p class="text-red-400">${data.error || 'Não foi possível carregar.'}</p>`;
            } catch (error) {
                console.error(`Erro ao buscar página ${pageType}:`, error);
                infoModalContent.innerHTML = `<p class="text-red-400">Ocorreu um erro de conexão.</p>`;
            }
        };
        
        // --- LÓGICA DE BUSCA/FILTRO ---
        const populateSearchFilters = () => {
            if (allProducts.length === 0) return;
            const marcas = [...new Set(allProducts.map(p => p.marca).filter(Boolean))].sort();
            const modelos = [...new Set(allProducts.map(p => p.modelo).filter(Boolean))].sort();
            const anos = [...new Set(allProducts.flatMap(p => p.ano).filter(Boolean))].sort((a, b) => b - a);

            brandSelect.innerHTML = '<option value="">Selecione a Marca</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
            modelSelect.innerHTML = '<option value="">Selecione o Modelo</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
            yearSelect.innerHTML = '<option value="">Selecione o Ano</option>' + anos.map(a => `<option value="${a}">${a}</option>`).join('');
            
            modelSelect.disabled = false;
            yearSelect.disabled = false;
        };
        
        const renderSearchResults = (productsToRender) => {
            searchResultsGrid.innerHTML = '';
            if (!productsToRender || productsToRender.length === 0) {
                searchResultsGrid.innerHTML = '<p class="text-center col-span-full text-gray-400">Nenhum produto encontrado com os filtros selecionados.</p>';
                return;
            }
            productsToRender.forEach(product => {
                const card = document.createElement('div');
                card.className = 'bg-gray-800 border border-gray-700 rounded-lg overflow-hidden flex flex-col';
                card.innerHTML = `
                    <img src="${product.imagemURL1 || 'https://placehold.co/600x400/1a1a1a/FFC700?text=IMG'}" alt="${product.nomeProduto}" class="w-full h-56 object-cover">
                    <div class="p-5 flex flex-col flex-grow">
                        <h3 class="font-anton text-2xl text-white truncate">${product.nomeProduto}</h3>
                        <p class="text-gray-400 text-sm mb-4">${product.marca || ''} / ${product.modelo || ''}</p>
                        <p class="text-3xl font-bold text-yellow-400 mt-auto mb-5">R$ ${product.preco ? product.preco.toFixed(2).replace('.', ',') : '0,00'}</p>
                        <button data-id="${product.id}" class="add-to-cart-btn w-full bg-yellow-400 text-gray-900 font-bold py-2 px-4 rounded hover:bg-yellow-500 transition-colors">Adicionar ao Carrinho</button>
                    </div>
                `;
                searchResultsGrid.appendChild(card);
            });
        };

        const performSearch = async () => {
            const marca = brandSelect.value;
            const modelo = modelSelect.value;
            const ano = yearSelect.value;
            const queryParams = new URLSearchParams({ marca, modelo, ano });
            const url = `/api/products/search?${queryParams.toString()}`;

            searchResultsGrid.innerHTML = '<div class="loader"></div>'; // Simula um loader
            mainContent.classList.add('hidden');
            searchResultsSection.classList.remove('hidden');
            searchResultsSection.scrollIntoView({ behavior: 'smooth' });

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('A busca falhou.');
                const results = await response.json();
                renderSearchResults(results);
            } catch (error) {
                console.error("Erro na busca:", error);
                searchResultsGrid.innerHTML = '<p class="text-red-500 text-center col-span-full">Ocorreu um erro ao buscar os produtos.</p>';
            }
        };

        // --- CARREGAMENTO INICIAL DE DADOS ---
        const loadInitialData = async () => {
            try {
                const [productsResponse, settingsResponse] = await Promise.all([
                    fetch('/api/products'),
                    fetch('/api/settings')
                ]);

                if (productsResponse.ok) {
                    allProducts = await productsResponse.json();
                    const bestSellers = allProducts.filter(p => p.isFeatured).slice(0, 9);
                    // Supondo que você tenha uma função renderProducts para os destaques
                    // renderProducts(bestSellers); 
                    populateSearchFilters();
                }

                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    contactInfoFooter.innerHTML = ''; // Limpa antes de adicionar
                    if (settings.contact_email) {
                        contactInfoFooter.innerHTML += `<li><a href="mailto:${settings.contact_email}" class="hover:text-yellow-400">${settings.contact_email}</a></li>`;
                    }
                     if (settings.contact_phone) {
                        contactInfoFooter.innerHTML += `<li><a href="tel:${settings.contact_phone}" class="hover:text-yellow-400">${settings.contact_phone}</a></li>`;
                    }
                }
                
            } catch (error) {
                console.error("Erro ao carregar dados iniciais:", error);
            }
        };

        // --- EVENT LISTENERS ---
        searchButton.addEventListener('click', performSearch);
        
        document.body.addEventListener('click', (e) => {
            const trigger = e.target.closest('.info-modal-trigger');
            if (trigger) {
                e.preventDefault();
                openInfoModal(trigger.dataset.modalType);
            }
        });

        closeInfoModalBtn.addEventListener('click', () => closeModal(infoModalOverlay, infoModal));
        infoModalOverlay.addEventListener('click', (e) => {
            if (e.target === infoModalOverlay) {
                closeModal(infoModalOverlay, infoModal);
            }
        });
        // Adicione outros listeners aqui (carrinho, login, etc.)
        
        loadInitialData();
    });
}
