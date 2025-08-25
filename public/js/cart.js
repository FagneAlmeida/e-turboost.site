// public/js/cart.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    // Adicionamos verificações para garantir que o script não quebre se for carregado em páginas sem estes elementos.
    const cartButton = document.getElementById('cart-button');
    const closeCartButton = document.getElementById('close-cart-btn');
    const cartPanel = document.getElementById('cart-panel');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartCountElement = document.getElementById('cart-count');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartSubtotalElement = document.getElementById('cart-subtotal');

    // Se os elementos essenciais do carrinho não existirem na página, o script não continua.
    if (!cartButton || !cartPanel || !cartItemsContainer) {
        console.warn('Elementos do carrinho não encontrados nesta página. O script do carrinho não será totalmente inicializado.');
        return;
    }

    // --- ESTADO DO CARRINHO ---
    let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

    // --- FUNÇÕES DE LÓGICA DO CARRINHO ---

    const saveCart = () => {
        localStorage.setItem('turboostCart', JSON.stringify(cart));
    };

    const addToCart = (product) => {
        if (!product || !product.id) {
            console.error("Tentativa de adicionar um produto inválido ao carrinho.", product);
            return;
        }
        const existingProductIndex = cart.findIndex(item => item.id === product.id);

        if (existingProductIndex > -1) {
            cart[existingProductIndex].quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        
        saveCart();
        renderCart();
        openCartPanel();
    };

    const removeFromCart = (productId) => {
        cart = cart.filter(item => item.id !== productId);
        saveCart();
        renderCart();
    };

    const updateQuantity = (productId, quantity) => {
        const productIndex = cart.findIndex(item => item.id === productId);
        if (productIndex > -1) {
            if (quantity > 0) {
                cart[productIndex].quantity = quantity;
            } else {
                cart.splice(productIndex, 1);
            }
        }
        saveCart();
        renderCart();
    };

    // --- FUNÇÕES DE RENDERIZAÇÃO E UI ---

    const renderCart = () => {
        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-gray-400 text-center">Seu carrinho está vazio.</p>';
        } else {
            cart.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'flex items-center justify-between gap-4 mb-4';
                const price = parseFloat(item.price || 0).toFixed(2);
                itemElement.innerHTML = `
                    <img src="${item.imageUrl}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md">
                    <div class="flex-grow">
                        <h4 class="font-bold">${item.name}</h4>
                        <p class="text-sm text-yellow-400">R$ ${price}</p>
                        <div class="flex items-center mt-2">
                            <input type="number" value="${item.quantity}" min="1" data-id="${item.id}" class="quantity-input w-16 p-1 bg-gray-700 border border-gray-600 rounded-md text-center">
                        </div>
                    </div>
                    <button data-id="${item.id}" class="remove-from-cart-btn text-red-500 hover:text-red-400" aria-label="Remover ${item.name} do carrinho">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                `;
                cartItemsContainer.appendChild(itemElement);
            });
        }

        updateCartCount();
        updateSubtotal();
    };

    const updateCartCount = () => {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        if (totalItems > 0) {
            cartCountElement.textContent = totalItems;
            cartCountElement.classList.remove('hidden');
        } else {
            cartCountElement.classList.add('hidden');
        }
    };

    const updateSubtotal = () => {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartSubtotalElement.textContent = `R$ ${subtotal.toFixed(2)}`;
    };

    const openCartPanel = () => {
        cartPanel.classList.remove('translate-x-full');
        cartOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeCartPanel = () => {
        cartPanel.classList.add('translate-x-full');
        cartOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    };

    // --- EVENT LISTENERS ---

    cartButton.addEventListener('click', openCartPanel);
    closeCartButton.addEventListener('click', closeCartPanel);
    cartOverlay.addEventListener('click', closeCartPanel);

    cartItemsContainer.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.remove-from-cart-btn');
        if (removeButton) {
            const productId = removeButton.dataset.id;
            removeFromCart(productId);
        }
    });
    
    cartItemsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('quantity-input')) {
            const productId = e.target.dataset.id;
            const quantity = parseInt(e.target.value, 10);
            updateQuantity(productId, quantity);
        }
    });

    // Listener de clique no documento inteiro (Event Delegation)
    // Esta é a parte mais importante: garante que os cliques são capturados
    // mesmo em botões que foram criados dinamicamente pelo products.js.
    document.addEventListener('click', (e) => {
        const addButton = e.target.closest('.add-to-cart-btn');
        if (addButton) {
            const card = addButton.closest('.product-card');
            if (card && card.dataset.productId) { // Verifica se o card e o ID existem
                const product = {
                    id: card.dataset.productId,
                    name: card.dataset.productName,
                    price: parseFloat(card.dataset.productPrice),
                    imageUrl: card.dataset.productImageUrl,
                };
                addToCart(product);
            }
        }
    });

    // --- INICIALIZAÇÃO ---
    renderCart();
});
