// public/js/checkout.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DA APLICAÇÃO ---
    let allProducts = [];
    let cart = JSON.parse(localStorage.getItem('turboostCart')) || {};
    let currentUser = null;
    let subtotal = 0;
    let mp; // Instância do Mercado Pago SDK

    // --- ELEMENTOS DO DOM ---
    const orderSummaryContainer = document.getElementById('order-summary');
    const summarySubtotal = document.getElementById('summary-subtotal');
    const summaryTotal = document.getElementById('summary-total');
    const checkoutForm = document.getElementById('checkout-form');
    const payButton = document.getElementById('pay-button');
    const walletContainer = document.getElementById('wallet_container');
    const emailField = document.getElementById('email');
    const nameField = document.getElementById('name');

    // --- AUTENTICAÇÃO ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            // Preenche automaticamente os campos de email e nome se estiverem vazios
            if (emailField) emailField.value = user.email;
            if (nameField && !nameField.value) nameField.value = user.displayName || '';
            payButton.disabled = Object.keys(cart).length === 0;
        } else {
            // Se não houver utilizador, redireciona para a página de login
            window.location.href = '/login.html?redirect=checkout';
        }
    });

    // --- LÓGICA DE DADOS E RENDERIZAÇÃO ---
    const loadProducts = async () => {
        try {
            const response = await fetch('/api/products');
            if (!response.ok) throw new Error('Falha ao carregar produtos.');
            const data = await response.json();
            allProducts = data.products || [];
            renderOrderSummary();
        } catch (error) {
            console.error("Erro ao carregar dados do produto:", error);
            orderSummaryContainer.innerHTML = '<p class="text-red-400">Não foi possível carregar os dados do carrinho.</p>';
            payButton.disabled = true;
        }
    };

    const renderOrderSummary = () => {
        orderSummaryContainer.innerHTML = '';
        subtotal = 0;

        if (Object.keys(cart).length === 0) {
            orderSummaryContainer.innerHTML = '<p class="text-gray-400">O seu carrinho está vazio.</p>';
            payButton.disabled = true;
            return;
        }

        for (const productId in cart) {
            const product = allProducts.find(p => p.id === productId);
            if (product) {
                const quantity = cart[productId];
                const itemTotal = product.price * quantity;
                subtotal += itemTotal;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex justify-between items-center';
                itemDiv.innerHTML = `
                    <div class="flex items-center gap-3">
                        <img src="${product.imageUrl || 'https://placehold.co/64x64/2c2c2c/FFF?text=?'}" alt="${product.name}" class="h-16 w-16 object-cover rounded-md">
                        <div>
                            <p class="text-white font-semibold">${product.name}</p>
                            <p class="text-sm text-gray-400">Quantidade: ${quantity}</p>
                        </div>
                    </div>
                    <span class="text-yellow-400 font-bold">R$ ${itemTotal.toFixed(2)}</span>
                `;
                orderSummaryContainer.appendChild(itemDiv);
            }
        }
        
        summarySubtotal.textContent = `R$ ${subtotal.toFixed(2)}`;
        summaryTotal.textContent = `R$ ${subtotal.toFixed(2)}`;
        if (currentUser) payButton.disabled = false;
    };

    // --- LÓGICA DE PAGAMENTO ---
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert("Você precisa de estar logado para finalizar a compra.");
            return;
        }
        
        payButton.disabled = true;
        payButton.textContent = 'A processar...';

        try {
            const idToken = await currentUser.getIdToken(true);
            const formData = new FormData(checkoutForm);
            const customerData = Object.fromEntries(formData.entries());

            const orderPayload = {
                items: Object.entries(cart).map(([id, quantity]) => ({ id, quantity })),
                customer: customerData
            };

            const response = await fetch('/api/create_payment', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(orderPayload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao criar o pagamento.');
            }

            const { preferenceId, publicKey } = await response.json();

            payButton.classList.add('hidden');
            
            if (!mp) {
                mp = new MercadoPago(publicKey, { locale: "pt-BR" });
            }
            mp.checkout({
                preference: { id: preferenceId },
                render: { container: '#wallet_container' }
            });

        } catch (error) {
            alert(`Erro: ${error.message}`);
            payButton.disabled = false;
            payButton.textContent = 'Ir para Pagamento';
        }
    });

    // --- INICIALIZAÇÃO ---
    loadProducts();
});
