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
        // ... (outros elementos do DOM)

        // --- ESTADO DA APLICAÇÃO ---
        let allProducts = [];
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

        // ... (funções de UI, carrinho, autenticação) ...

        // --- LÓGICA DE BUSCA/FILTRO (ATUALIZADA) ---
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
                card.className = 'bg-secondary border border-gray-700 rounded-lg overflow-hidden flex flex-col transition-transform duration-300 hover:scale-105';
                card.innerHTML = `
                    <img src="${product.imagemURL1 || 'https://placehold.co/600x400/1a1a1a/FFC700?text=Turboost'}" alt="Imagem de ${product.nomeProduto}" class="w-full h-56 object-cover">
                    <div class="p-5 flex flex-col flex-grow">
                        <h3 class="font-anton text-2xl text-white truncate" title="${product.nomeProduto}">${product.nomeProduto}</h3>
                        <p class="text-gray-400 text-sm mb-4">${product.marca || ''} / ${product.modelo || ''}</p>
                        <p class="text-3xl font-bold text-accent mt-auto mb-5">R$ ${product.preco ? product.preco.toFixed(2).replace('.', ',') : '0,00'}</p>
                        <button data-id="${product.id}" class="border border-accent text-accent hover:bg-accent hover:text-secondary w-full add-to-cart-btn mt-auto py-2 px-4 rounded-md font-semibold transition-colors duration-300">Adicionar ao Carrinho</button>
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

            searchResultsGrid.innerHTML = '<div class="loader"></div>';
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
                const productsResponse = await fetch('/api/products');
                if (!productsResponse.ok) throw new Error('Falha ao buscar produtos');
                allProducts = await productsResponse.json();
                
                const bestSellers = allProducts.filter(p => p.isFeatured).slice(0, 9);
                renderProducts(bestSellers);
                populateSearchFilters();
                
                // ... (código de settings)
            } catch (error) {
                // ... (código de erro)
            }
        };

        // --- EVENT LISTENERS ---
        searchButton.addEventListener('click', performSearch);
        
        searchResultsGrid.addEventListener('click', e => {
            const btn = e.target.closest('.add-to-cart-btn');
            if (btn) addToCart(btn.dataset.id);
        });
        
        // ... (restante dos listeners)
        
        loadInitialData();
    });
}
