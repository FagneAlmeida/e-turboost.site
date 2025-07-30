import { firebasePromise } from '/js/app-init.js';

// --- INICIALIZAÇÃO DO FIREBASE COM TRATAMENTO DE ERRO ---
firebasePromise.then(({ auth, db }) => {
    // Código principal só é executado se o Firebase for inicializado com sucesso.
    main(auth, db);
}).catch(error => {
    console.error("Falha na inicialização do Firebase:", error);
    // Exibe uma mensagem de erro para o usuário na UI, se necessário.
    const productGrid = document.getElementById('product-grid');
    if (productGrid) {
        productGrid.innerHTML = `<div class="col-span-full bg-primary p-4 rounded-lg text-center">
            <p class="text-red-400">Erro de conexão. Não foi possível carregar a loja. Tente novamente mais tarde.</p>
        </div>`;
    }
});

// --- FUNÇÃO DE DEBOUNCE ---
const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

// --- FUNÇÃO PRINCIPAL DA APLICAÇÃO ---
function main(auth, db) {
    document.addEventListener('DOMContentLoaded', () => {
        // --- ELEMENTOS DO DOM ---
        const productGrid = document.getElementById('product-grid');
        const cartCountEl = document.getElementById('cart-count');
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotalEl = document.getElementById('cart-total');
        const cartPanel = document.getElementById('cart-panel');
        const cartOverlay = document.getElementById('cart-overlay');
        const authModalOverlay = document.getElementById('auth-modal-overlay');
        const authModal = document.getElementById('auth-modal');
        const loginView = document.getElementById('customer-login-view');
        const registerView = document.getElementById('customer-register-view');
        const loginForm = document.getElementById('customer-login-form');
        const registerForm = document.getElementById('customer-register-form');
        const loginFormError = document.getElementById('login-form-error');
        const registerFormError = document.getElementById('register-form-error');
        const headerLogo = document.getElementById('header-logo');
        const footerLogo = document.getElementById('footer-logo');
        const favicon = document.getElementById('favicon');
        // Elementos de busca
        const searchMarca = document.getElementById('marca');
        const searchModelo = document.getElementById('modelo');
        const searchAno = document.getElementById('ano');
        const searchBtn = document.getElementById('search-btn');


        // --- ESTADO DA APLICAÇÃO ---
        let allProducts = [];
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];

        // --- FUNÇÕES AUXILIARES E DE UI ---
        const openModal = (overlay, modal) => {
            if (overlay && modal) {
                overlay.classList.add('open');
                modal.classList.add('open');
            }
        };

        const closeModal = (overlay, modal) => {
            if (overlay && modal) {
                overlay.classList.remove('open');
                modal.classList.remove('open');
            }
        };

        // --- FUNÇÕES DE RENDERIZAÇÃO ---
        const renderProducts = (productsToRender) => {
            productGrid.innerHTML = '';
            if (!productsToRender || productsToRender.length === 0) {
                productGrid.innerHTML = '<p class="text-center col-span-full text-gray-400">Nenhum produto encontrado com os filtros selecionados.</p>';
                return;
            }
            productsToRender.forEach(product => {
                const card = document.createElement('div');
                // Classes customizadas removidas. Usando apenas utilitários do Tailwind.
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
                productGrid.appendChild(card);
            });
        };

        const updateCartUI = () => {
            cartItemsContainer.innerHTML = '';
            if (cart.length === 0) {
                cartItemsContainer.innerHTML = '<p class="text-gray-500 text-center p-4">O seu carrinho está vazio.</p>';
            } else {
                cart.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.className = 'flex items-center gap-4 p-4 border-b border-gray-800';
                    itemEl.innerHTML = `
                        <img src="${item.imagemURL1 || 'https://placehold.co/64/1a1a1a/FFC700?text=T'}" class="w-16 h-16 object-cover rounded-md">
                        <div class="flex-grow">
                            <p class="font-bold text-white text-sm">${item.nomeProduto}</p>
                            <p class="text-xs text-accent">R$ ${item.preco.toFixed(2).replace('.', ',')}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="number" min="1" value="${item.quantity}" data-id="${item.id}" class="w-12 text-center bg-gray-700 rounded-md quantity-input">
                            <button data-id="${item.id}" class="text-red-500 hover:text-red-400 text-2xl remove-from-cart-btn">&times;</button>
                        </div>
                    `;
                    cartItemsContainer.appendChild(itemEl);
                });
            }
            const total = cart.reduce((sum, item) => sum + (item.preco * item.quantity), 0);
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartTotalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
            cartCountEl.textContent = count;
            localStorage.setItem('turboostCart', JSON.stringify(cart));
        };

        // --- LÓGICA DO CARRINHO ---
        const addToCart = (productId) => {
            const product = allProducts.find(p => p.id === productId);
            if (!product) return;
            const existingItem = cart.find(item => item.id === productId);
            if (existingItem) {
                existingItem.quantity++;
            } else {
                cart.push({ ...product, quantity: 1 });
            }
            updateCartUI();
            openModal(cartOverlay, cartPanel);
        };

        const updateCartQuantity = (productId, quantity) => {
            const item = cart.find(i => i.id === productId);
            if (item) {
                item.quantity = Math.max(1, parseInt(quantity, 10));
            }
            updateCartUI();
        };

        const removeFromCart = (productId) => {
            cart = cart.filter(item => item.id !== productId);
            updateCartUI();
        };

        // --- LÓGICA DE AUTENTICAÇÃO ---
        auth.onAuthStateChanged(user => {
            const userArea = document.getElementById('user-area');
            const userInfo = document.getElementById('user-info');
            if (user) {
                userArea.classList.add('hidden');
                userInfo.classList.remove('hidden');
                document.getElementById('user-greeting').textContent = `Olá, ${user.displayName || user.email.split('@')[0]}`;
            } else {
                userArea.classList.remove('hidden');
                userInfo.classList.add('hidden');
            }
        });

        loginForm.addEventListener('submit', e => {
            e.preventDefault();
            loginFormError.textContent = '';
            const email = loginForm['login-email'].value.trim();
            const password = loginForm['login-password'].value;
            
            if (!email || !password) {
                loginFormError.textContent = "Por favor, preencha todos os campos.";
                return;
            }

            auth.signInWithEmailAndPassword(email, password)
                .then(() => closeModal(authModalOverlay, authModal))
                .catch(() => loginFormError.textContent = "Email ou senha inválidos.");
        });

        registerForm.addEventListener('submit', e => {
            e.preventDefault();
            registerFormError.textContent = '';
            const name = registerForm['register-name'].value.trim();
            const email = registerForm['register-email'].value.trim();
            const password = registerForm['register-password'].value;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!name || !email || !password) {
                registerFormError.textContent = "Por favor, preencha todos os campos.";
                return;
            }
            if (!emailRegex.test(email)) {
                registerFormError.textContent = "Por favor, insira um email válido.";
                return;
            }
            if (password.length < 6) {
                registerFormError.textContent = "A senha deve ter no mínimo 6 caracteres.";
                return;
            }

            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => userCredential.user.updateProfile({ displayName: name }))
                .then(() => closeModal(authModalOverlay, authModal))
                .catch(error => {
                    if (error.code === 'auth/email-already-in-use') {
                        registerFormError.textContent = "Este email já está em uso.";
                    } else {
                        registerFormError.textContent = "Erro ao criar conta. Verifique os dados.";
                    }
                });
        });

        // --- LÓGICA DE BUSCA/FILTRO ---
        const filterProducts = () => {
            const marca = searchMarca.value.toLowerCase();
            const modelo = searchModelo.value.toLowerCase();
            const ano = searchAno.value;

            const filtered = allProducts.filter(p => {
                const matchMarca = !marca || (p.marca && p.marca.toLowerCase().includes(marca));
                const matchModelo = !modelo || (p.modelo && p.modelo.toLowerCase().includes(modelo));
                const matchAno = !ano || (p.ano && Array.isArray(p.ano) && p.ano.includes(parseInt(ano)));
                return matchMarca && matchModelo && matchAno;
            });
            renderProducts(filtered);
        };
        
        const debouncedFilter = debounce(filterProducts, 300);

        // --- CARREGAMENTO INICIAL DE DADOS ---
        const loadInitialData = async () => {
            try {
                const [productsResponse, settingsResponse] = await Promise.all([
                    fetch('/api/products'),
                    fetch('/api/settings')
                ]);

                if (!productsResponse.ok) throw new Error('Falha ao buscar produtos');
                allProducts = await productsResponse.json();
                const bestSellers = allProducts.filter(p => p.isFeatured).slice(0, 9);
                renderProducts(bestSellers);

                if (settingsResponse.ok) {
                    const settings = await settingsResponse.json();
                    if (settings.logoUrl) {
                        headerLogo.src = settings.logoUrl;
                        footerLogo.src = settings.logoUrl;
                    }
                    if (settings.faviconUrl) favicon.href = settings.faviconUrl;
                }

            } catch (error) {
                console.error("Erro ao carregar dados iniciais:", error);
                productGrid.innerHTML = '<p class="text-red-500 text-center col-span-full">Não foi possível carregar os produtos.</p>';
            }
        };

        // --- EVENT LISTENERS ---
        searchBtn.addEventListener('click', filterProducts);
        [searchMarca, searchModelo, searchAno].forEach(input => {
            input.addEventListener('input', debouncedFilter);
        });
        
        document.getElementById('login-btn').addEventListener('click', () => openModal(authModalOverlay, authModal));
        document.getElementById('main-logout-btn').addEventListener('click', () => auth.signOut());
        document.getElementById('cart-button').addEventListener('click', () => openModal(cartOverlay, cartPanel));
        document.getElementById('close-cart-btn').addEventListener('click', () => closeModal(cartOverlay, cartPanel));
        cartOverlay.addEventListener('click', () => closeModal(cartOverlay, cartPanel));
        document.getElementById('checkout-btn').addEventListener('click', () => {
            if (cart.length > 0) window.location.href = '/checkout.html';
        });
        
        productGrid.addEventListener('click', e => {
            const btn = e.target.closest('.add-to-cart-btn');
            if (btn) addToCart(btn.dataset.id);
        });

        cartItemsContainer.addEventListener('change', e => {
            if (e.target.classList.contains('quantity-input')) {
                updateCartQuantity(e.target.dataset.id, e.target.value);
            }
        });

        cartItemsContainer.addEventListener('click', e => {
            const btn = e.target.closest('.remove-from-cart-btn');
            if (btn) removeFromCart(btn.dataset.id);
        });

        document.getElementById('show-register-view-btn').addEventListener('click', () => {
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
        });
        document.getElementById('show-login-view-btn').addEventListener('click', () => {
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
        });
        
        document.getElementById('close-auth-modal-btn').addEventListener('click', () => closeModal(authModalOverlay, authModal));
        authModalOverlay.addEventListener('click', (e) => {
            if (e.target === authModalOverlay) closeModal(authModalOverlay, authModal);
        });

        // --- INICIALIZAÇÃO ---
        loadInitialData();
        updateCartUI();
    });
}
