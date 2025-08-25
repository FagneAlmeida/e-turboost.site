// public/js/products.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const productGrid = document.getElementById('product-grid');
    const sortOptions = document.getElementById('sort-options');
    // Adicione aqui os elementos de filtro quando forem implementados

    // --- ESTADO DA APLICAÇÃO ---
    let allProducts = [];

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const renderProducts = (productsToRender) => {
        if (!productGrid) {
            console.error("Elemento 'product-grid' não encontrado.");
            return;
        }
        productGrid.innerHTML = ''; // Limpa a grelha antes de renderizar

        if (productsToRender.length === 0) {
            productGrid.innerHTML = '<p class="text-center text-gray-400 col-span-full">Nenhum produto encontrado.</p>';
            return;
        }

        productsToRender.forEach(product => {
            // CORREÇÃO: Mapeamento para os nomes de campos corretos do Firestore
            const name = product.nomeProduto;
            const priceValue = product.preco;
            // CORREÇÃO: Usa a primeira imagem do array 'imagemURLs'
            const imageUrl = (product.imagemURLs && product.imagemURLs.length > 0) ? product.imagemURLs[0] : 'https://placehold.co/400x300/1f2937/FFF?text=Produto';

            const price = typeof priceValue === 'number' ? `R$ ${priceValue.toFixed(2)}` : 'Preço sob consulta';
            
            const productCard = `
                <div class="product-card bg-gray-800 rounded-lg overflow-hidden shadow-lg flex flex-col transition-transform duration-300 hover:transform hover:-translate-y-2">
                    <img src="${imageUrl}" alt="${name}" class="w-full h-56 object-cover">
                    <div class="p-6 flex flex-col flex-grow">
                        <h3 class="text-xl font-bold font-anton text-white">${name}</h3>
                        <div class="mt-auto pt-4">
                            <p class="text-2xl font-bold text-yellow-400">${price}</p>
                            <button class="add-to-cart-btn mt-4 w-full btn btn-accent" data-product-id="${product.id}">Adicionar ao Carrinho</button>
                        </div>
                    </div>
                </div>
            `;
            productGrid.innerHTML += productCard;
        });
    };

    // --- FUNÇÕES DE LÓGICA (Filtro e Ordenação) ---
    const applySort = () => {
        const sortBy = sortOptions.value;
        let sortedProducts = [...allProducts];

        switch (sortBy) {
            case 'price-asc':
                // CORREÇÃO: Ordena pelo campo 'preco'
                sortedProducts.sort((a, b) => a.preco - b.preco);
                break;
            case 'price-desc':
                // CORREÇÃO: Ordena pelo campo 'preco'
                sortedProducts.sort((a, b) => b.preco - a.preco);
                break;
            case 'relevance':
            default:
                // Mantém a ordem padrão
                break;
        }
        renderProducts(sortedProducts);
    };

    // --- CARREGAMENTO INICIAL DE DADOS ---
    const loadAllProducts = async () => {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) {
                throw new Error('Falha ao carregar os produtos do servidor.');
            }
            const data = await response.json();
            allProducts = data.products || [];
            applySort(); // Renderiza os produtos com a ordenação padrão
        } catch (error) {
            console.error("Erro ao carregar produtos:", error);
            if (productGrid) {
                productGrid.innerHTML = '<p class="text-center text-red-500 col-span-full">Não foi possível carregar os produtos. Tente novamente mais tarde.</p>';
            }
        }
    };

    // --- EVENT LISTENERS ---
    if (sortOptions) {
        sortOptions.addEventListener('change', applySort);
    }

    // --- INICIALIZAÇÃO ---
    loadAllProducts();
});
