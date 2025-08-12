import { firebasePromise } from './app-init.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ELEMENTOS DO DOM ---
    const checkoutForm = document.getElementById('checkout-form');
    const cepInput = document.getElementById('cep');
    const streetInput = document.getElementById('street');
    const neighborhoodInput = document.getElementById('neighborhood');
    const cityInput = document.getElementById('city');
    const stateInput = document.getElementById('state');
    const numberInput = document.getElementById('number');
    const shippingOptionsContainer = document.getElementById('shipping-options-container');
    const shippingMessage = document.getElementById('shipping-message');
    const shippingLoader = document.getElementById('shipping-loader');
    const summaryShippingEl = document.getElementById('summary-shipping');
    const summaryTotalEl = document.getElementById('summary-total');
    const summarySubtotalEl = document.getElementById('summary-subtotal');
    const payButton = document.getElementById('pay-button');
    const walletContainer = document.getElementById('wallet_container');
    
    // --- ESTADO DA APLICAÇÃO ---
    let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];
    let currentUser = null;
    let subtotal = 0;
    let selectedShipping = null;
    let mp; // Instância do Mercado Pago

    // --- FUNÇÕES DE API E LÓGICA ---

    const renderOrderSummary = (products) => {
        const orderSummaryEl = document.getElementById('order-summary');
        orderSummaryEl.innerHTML = '';
        subtotal = 0;
        
        const cartMap = new Map(cart.map(item => [item.id, item.quantity]));

        products.forEach(product => {
            const quantity = cartMap.get(product.id);
            subtotal += product.price * quantity;
            orderSummaryEl.innerHTML += `
                <div class="flex justify-between text-sm">
                    <span>${quantity}x ${product.name}</span>
                    <span>R$ ${(product.price * quantity).toFixed(2)}</span>
                </div>
            `;
        });

        summarySubtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
        updateTotal();
    };

    const updateTotal = () => {
        const shippingCost = selectedShipping ? selectedShipping.price : 0;
        const total = subtotal + shippingCost;
        summaryShippingEl.textContent = `R$ ${shippingCost.toFixed(2)}`;
        summaryTotalEl.textContent = `R$ ${total.toFixed(2)}`;
        
        payButton.disabled = !selectedShipping || !checkoutForm.checkValidity();
    };

    const renderShippingOptions = (options) => {
        shippingMessage.classList.add('hidden');
        shippingOptionsContainer.innerHTML = '';

        if (!options || options.length === 0) {
            shippingOptionsContainer.innerHTML = '<p class="text-red-400">Nenhuma opção de frete encontrada para este CEP.</p>';
            return;
        }

        options.forEach(option => {
            const optionId = `shipping-${option.name.replace(/\s+/g, '-')}`;
            const optionDiv = document.createElement('div');
            optionDiv.className = 'shipping-option border border-gray-600 p-4 rounded-md cursor-pointer hover:border-detail';
            optionDiv.innerHTML = `
                <input type="radio" name="shipping" id="${optionId}" value='${JSON.stringify(option)}' class="hidden" required>
                <label for="${optionId}" class="flex justify-between items-center cursor-pointer">
                    <span class="font-medium">${option.name}</span>
                    <span class="text-lg font-bold">R$ ${option.price.toFixed(2)}</span>
                </label>
                <p class="text-sm text-text-muted">Prazo de entrega: ${option.delivery_days} dias</p>
            `;
            shippingOptionsContainer.appendChild(optionDiv);
        });
    };

    const getShippingOptions = async (cep) => {
        shippingLoader.classList.remove('hidden');
        shippingMessage.classList.add('hidden');
        shippingOptionsContainer.innerHTML = '';
        selectedShipping = null;
        updateTotal();

        try {
            const response = await fetch('/api/shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cep, items: cart })
            });
            if (!response.ok) throw new Error('Falha ao calcular o frete.');
            
            const shippingData = await response.json();
            renderShippingOptions(shippingData.options);

        } catch (error) {
            console.error("Erro ao buscar frete:", error);
            shippingOptionsContainer.innerHTML = `<p class="text-red-400">${error.message}</p>`;
        } finally {
            shippingLoader.classList.add('hidden');
        }
    };
    
    const handleCepInput = async (event) => {
        const cep = event.target.value.replace(/\D/g, '');
        if (cep.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('CEP não encontrado.');
            const data = await response.json();
            if (data.erro) {
                streetInput.value = '';
                neighborhoodInput.value = '';
                cityInput.value = '';
                stateInput.value = '';
                return;
            }

            streetInput.value = data.logradouro;
            neighborhoodInput.value = data.bairro;
            cityInput.value = data.localidade;
            stateInput.value = data.uf;
            numberInput.focus();

            await getShippingOptions(cep);

        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            shippingMessage.textContent = "CEP não encontrado. Tente novamente.";
            shippingMessage.classList.remove('hidden');
        }
    };

    const createPayment = async () => {
        if (!checkoutForm.checkValidity() || !selectedShipping || !currentUser) {
            alert("Por favor, preencha todos os campos obrigatórios e selecione uma opção de frete.");
            return;
        }

        payButton.disabled = true;
        payButton.textContent = 'A processar...';

        try {
            const idToken = await currentUser.getIdToken(true);
            
            const orderData = {
                customer: {
                    name: document.getElementById('name').value,
                    email: document.getElementById('email').value,
                    phone: document.getElementById('phone').value,
                    cpf: document.getElementById('cpf').value,
                },
                shippingAddress: {
                    street: streetInput.value,
                    number: numberInput.value,
                    complement: document.getElementById('complement').value,
                    neighborhood: neighborhoodInput.value,
                    city: cityInput.value,
                    state: stateInput.value,
                    zip: cepInput.value,
                },
                items: cart,
                shipping: selectedShipping
            };

            const response = await fetch('/api/create_payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(orderData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao criar o pagamento.');
            }

            const { preferenceId, publicKey } = await response.json();

            // Esconde o botão de pagar e renderiza o Wallet Brick
            payButton.classList.add('hidden');
            if (!mp) {
                mp = new MercadoPago(publicKey);
            }
            mp.checkout({
                preference: {
                    id: preferenceId
                },
                render: {
                    container: '#wallet_container',
                    label: 'Finalizar Pagamento',
                }
            });

        } catch (error) {
            alert(`Erro: ${error.message}`);
            payButton.disabled = false;
            payButton.textContent = 'Pagar com Mercado Pago';
        }
    };

    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    const { auth } = await firebasePromise;
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('email').value = user.email;
            
            if (cart.length === 0) {
                window.location.href = '/index.html';
                return;
            }
            
            const response = await fetch('/api/cart-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: cart.map(item => item.id) })
            });
            const productsWithDetails = await response.json();
            renderOrderSummary(productsWithDetails);
            
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('checkout-content').classList.remove('hidden');

        } else {
            localStorage.setItem('redirectAfterLogin', '/checkout.html');
            window.location.href = '/index.html#login';
        }
    });

    cepInput.addEventListener('blur', handleCepInput);

    shippingOptionsContainer.addEventListener('click', (e) => {
        const optionDiv = e.target.closest('.shipping-option');
        if (!optionDiv) return;

        document.querySelectorAll('.shipping-option').forEach(el => el.classList.remove('border-detail', 'bg-gray-700'));
        optionDiv.classList.add('border-detail', 'bg-gray-700');
        
        const radio = optionDiv.querySelector('input[type="radio"]');
        radio.checked = true;
        
        selectedShipping = JSON.parse(radio.value);
        updateTotal();
    });

    checkoutForm.addEventListener('input', () => {
        updateTotal();
    });

    payButton.addEventListener('click', createPayment);
});
