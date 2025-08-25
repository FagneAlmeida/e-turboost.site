// public/js/main.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Inicializa o Firebase com a configuração injetada pelo HTML
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const userActions = document.getElementById('user-actions');
    const loginLink = document.getElementById('login-link');
    const productGrid = document.getElementById('product-grid');
    const loader = document.getElementById('loader');
    const aboutUsBtn = document.getElementById('about-us-btn');
    const aboutUsModalOverlay = document.getElementById('about-us-modal-overlay');
    const closeAboutUsModalBtn = document.getElementById('close-about-us-modal-btn');

    // --- LÓGICA DE AUTENTICAÇÃO E UI DO CABEÇALHO ---
    onAuthStateChanged(auth, (user) => {
        if (!userActions || !loginLink) return;
        
        const existingControls = userActions.querySelector('#user-controls');
        if (existingControls) existingControls.remove();

        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'user-controls';
        controlsContainer.className = 'flex items-center space-x-4';

        if (user) {
            // Utilizador LOGADO
            loginLink.style.display = 'none';
            
            const accountLink = document.createElement('a');
            accountLink.href = '/minha-conta.html';
            accountLink.textContent = 'Minha Conta';
            accountLink.className = 'hover:text-yellow-400 transition-colors';
            
            const logoutBtn = document.createElement('button');
            logoutBtn.textContent = 'Sair';
            logoutBtn.className = 'hover:text-yellow-400 transition-colors';
            logoutBtn.onclick = () => signOut(auth).catch(error => console.error("Erro ao sair:", error));

            controlsContainer.appendChild(accountLink);
            controlsContainer.appendChild(logoutBtn);
        } else {
            // Utilizador DESLOGADO
            loginLink.style.display = 'block';
        }
        userActions.prepend(controlsContainer);
    });

    // --- LÓGICA PARA CARREGAR PRODUTOS EM DESTAQUE ---
    const fetchProducts = async () => {
        if (loader) loader.style.display = 'block';
        try {
            const response = await fetch('/api/products'); // Usa a rota correta
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            const data = await response.json();
            return data.products || [];
        } catch (error) {
            console.error("Falha ao buscar produtos:", error);
            if(productGrid) productGrid.innerHTML = `<p class="col-span-full text-center text-red-500">Não foi possível carregar os produtos.</p>`;
            return [];
        } finally {
            if(loader) loader.style.display = 'none';
        }
    };

    const renderFeaturedProducts = (products) => {
        if (!productGrid) return;
        productGrid.innerHTML = '';

        const featuredProducts = products.filter(p => p.isFeatured);

        if (featuredProducts.length === 0) {
            productGrid.innerHTML = `<p class="col-span-full text-center text-gray-400">Nenhum produto em destaque no momento.</p>`;
            return;
        }

        featuredProducts.forEach(product => {
            const productCard = document.createElement('div');
            // Estrutura de dados que o cart.js espera
            productCard.className = 'product-card bg-gray-800 rounded-lg overflow-hidden shadow-lg transform hover:scale-105 transition-transform duration-300 flex flex-col';
            productCard.dataset.productId = product.id;
            productCard.dataset.productName = product.name;
            productCard.dataset.productPrice = product.price;
            productCard.dataset.productImageUrl = product.imageUrl;

            productCard.innerHTML = `
                <div class="relative">
                    <img src="${product.imageUrl}" alt="${product.name}" class="w-full h-56 object-cover">
                    <span class="absolute top-2 left-2 bg-yellow-500 text-gray-900 text-xs font-bold px-2 py-1 rounded">Destaque</span>
                </div>
                <div class="p-4 flex flex-col flex-grow">
                    <h3 class="text-xl font-bold font-anton uppercase truncate">${product.name}</h3>
                    <p class="text-gray-400 mt-1 flex-grow">${product.description}</p>
                    <div class="mt-4 flex justify-between items-center">
                        <span class="text-2xl font-bold text-yellow-400">R$ ${parseFloat(product.price).toFixed(2)}</span>
                        <button class="add-to-cart-btn bg-gray-700 text-white p-2 rounded-full hover:bg-yellow-500 hover:text-gray-900 transition-colors" aria-label="Adicionar ${product.name} ao carrinho">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                        </button>
                    </div>
                </div>
            `;
            productGrid.appendChild(productCard);
        });
    };

    // --- LÓGICA DO MODAL "SOBRE NÓS" ---
    const toggleAboutUsModal = (show) => {
        if (aboutUsModalOverlay) {
            aboutUsModalOverlay.classList.toggle('hidden', !show);
            aboutUsModalOverlay.classList.toggle('flex', show);
        }
    };
    
    if (aboutUsBtn) aboutUsBtn.addEventListener('click', () => toggleAboutUsModal(true));
    if (closeAboutUsModalBtn) closeAboutUsModalBtn.addEventListener('click', () => toggleAboutUsModal(false));
    if (aboutUsModalOverlay) {
        aboutUsModalOverlay.addEventListener('click', (e) => {
            if (e.target === aboutUsModalOverlay) toggleAboutUsModal(false);
        });
    }

    // --- INICIALIZAÇÃO ---
    const init = async () => {
        const products = await fetchProducts();
        renderFeaturedProducts(products);
    };

    if (productGrid) {
        init();
    }
});
