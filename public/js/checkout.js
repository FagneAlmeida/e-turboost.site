import { firebasePromise } from './app-init.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- INICIALIZAÇÃO E VERIFICAÇÃO ---
    const { auth, db } = await firebasePromise;
    const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const loader = document.getElementById('loader');
    const checkoutContent = document.getElementById('checkout-content');

    let allProducts = new Map();
    let cart = [];
    let currentUser = null;
    let selectedShipping = null;

    // --- ELEMENTOS DO DOM ---
    const form = document.getElementById('checkout-form');
    const cepInput = document.getElementById('cep');
    const shippingOptionsContainer = document.getElementById('shipping-options-container');
    const shippingMessage = document.getElementById('shipping-message');
    const shippingLoader = document.getElementById('shipping-loader');
    const orderSummaryContainer = document.getElementById('order-summary');
    const summarySubtotalEl = document.getElementById('summary-subtotal');
    const summaryShippingEl = document.getElementById('summary-shipping');
    const summaryTotalEl = document.getElementById('summary-total');
    const payButton = document.getElementById('pay-button');

    // --- FUNÇÕES PRINCIPAIS ---
    
    /**
     * Busca todos os produtos do Firestore para obter dados atualizados.
     */
    async function fetchAllProducts() {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            querySnapshot.forEach(doc => {
                allProducts.set(doc.id, { id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error("Erro ao buscar todos os produtos:", error);
        }
    }

    /**
     * Renderiza o resumo do pedido com base nos itens do carrinho.
     */
    function renderOrderSummary() {
        orderSummaryContainer.innerHTML = '';
        if (cart.length === 0) {
            orderSummaryContainer.innerHTML = '<p class="text-text-muted">O seu carrinho está vazio.</p>';
            return;
        }

        let subtotal = 0;
        cart.forEach(item => {
            const product = allProducts.get(item.id);
            if (product) {
                subtotal += product.preco * item.quantity;
                const itemHtml = `
                    <div class="flex justify-between items-center text-sm">
                        <div class="flex items-center">
                            <img src="${product.imagemURL1 || 'https://placehold.co/48'}" alt="${product.nomeProduto}" class="w-12 h-12 rounded-md mr-3 object-cover">
                            <div>
                                <p class="font-bold">${product.nomeProduto}</p>
                                <p class="text-text-muted">Qtd: ${item.quantity}</p>
                            </div>
                        </div>
                        <span>R$ ${(product.preco * item.quantity).toFixed(2).replace('.', ',')}</span>
                    </div>
                `;
                orderSummaryContainer.innerHTML += itemHtml;
            }
        });
        summarySubtotalEl.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
        updateTotal();
    }

    /**
     * Atualiza o valor total do pedido (subtotal + frete).
     */
    function updateTotal() {
        const subtotal = parseFloat(summarySubtotalEl.textContent.replace('R$ ', '').replace(',', '.')) || 0;
        const shippingCost = selectedShipping ? parseFloat(selectedShipping.Valor) : 0;
        const total = subtotal + shippingCost;

        summaryShippingEl.textContent = `R$ ${shippingCost.toFixed(2).replace('.', ',')}`;
        summaryTotalEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
        
        payButton.disabled = !selectedShipping || cart.length === 0;
    }

    /**
     * Busca o endereço correspondente a um CEP e preenche o formulário.
     * @param {string} cep O CEP para buscar.
     */
    async function fetchAddress(cep) {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('CEP não encontrado');
            
            const address = await response.json();
            if (address.erro) {
                console.warn('API ViaCEP retornou um erro para o CEP:', cep);
                return;
            }

            // Preenche os campos do formulário com os dados retornados
            document.getElementById('street').value = address.logradouro || '';
            document.getElementById('neighborhood').value = address.bairro || '';
            document.getElementById('city').value = address.localidade || '';
            document.getElementById('state').value = address.uf || '';
            
            // Foca no campo de número para o próximo passo do utilizador
            document.getElementById('number').focus();

        } catch (error) {
            console.error('Erro ao buscar endereço:', error);
        }
    }

    /**
     * Busca opções de frete com base no CEP.
     */
    async function fetchShippingOptions() {
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length !== 8) {
            shippingOptionsContainer.innerHTML = '<p id="shipping-message" class="text-yellow-400">Por favor, insira um CEP válido.</p>';
            return;
        }

        shippingMessage.style.display = 'none';
        shippingLoader.style.display = 'block';
        shippingOptionsContainer.innerHTML = ''; // Limpa opções antigas
        selectedShipping = null;
        updateTotal();

        try {
            const itemsForApi = cart.map(item => {
                const product = allProducts.get(item.id);
                return {
                    ...product,
                    quantity: item.quantity
                };
            });

            const response = await fetch('/api/shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cep, items: itemsForApi })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Não foi possível calcular o frete.');
            }

            const options = await response.json();
            renderShippingOptions(options);

        } catch (error) {
            shippingOptionsContainer.innerHTML = `<p class="text-red-500">${error.message}</p>`;
        } finally {
            shippingLoader.style.display = 'none';
        }
    }

    /**
     * Renderiza as opções de frete na UI.
     */
    function renderShippingOptions(options) {
        shippingOptionsContainer.innerHTML = '';
        if (options.length === 0) {
            shippingOptionsContainer.innerHTML = '<p class="text-text-muted">Nenhuma opção de frete encontrada para este CEP.</p>';
            return;
        }

        options.forEach((option, index) => {
            const optionHtml = `
                <label class="flex items-center justify-between p-4 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-800">
                    <div class="flex items-center">
                        <input type="radio" name="shipping" value='${JSON.stringify(option)}' class="form-radio text-detail focus:ring-detail" ${index === 0 ? 'checked' : ''}>
                        <div class="ml-3">
                            <p class="font-bold text-white">${option.Nome}</p>
                            <p class="text-sm text-text-muted">Prazo de entrega: ${option.PrazoEntrega} dias úteis</p>
                        </div>
                    </div>
                    <span class="font-bold text-detail">R$ ${parseFloat(option.Valor).toFixed(2).replace('.', ',')}</span>
                </label>
            `;
            shippingOptionsContainer.innerHTML += optionHtml;
        });
        
        // Seleciona a primeira opção por defeito
        if (options.length > 0) {
            selectedShipping = options[0];
            updateTotal();
        }
        
        // Adiciona event listener para mudança de opção
        document.querySelectorAll('input[name="shipping"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                selectedShipping = JSON.parse(e.target.value);
                updateTotal();
            });
        });
    }

    /**
     * Inicia o processo de pagamento.
     */
    async function createPayment() {
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        payButton.disabled = true;
        payButton.textContent = 'A processar...';

        const orderData = {
            userId: currentUser.uid,
            customer: {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                cpf: document.getElementById('cpf').value,
            },
            shipping: {
                ...selectedShipping,
                address: {
                    cep: document.getElementById('cep').value,
                    street: document.getElementById('street').value,
                    number: document.getElementById('number').value,
                    complement: document.getElementById('complement').value,
                    neighborhood: document.getElementById('neighborhood').value,
                    city: document.getElementById('city').value,
                    state: document.getElementById('state').value,
                }
            },
            items: cart.map(item => {
                const product = allProducts.get(item.id);
                return {
                    id: product.id,
                    title: product.nomeProduto,
                    quantity: item.quantity,
                    unit_price: product.preco
                };
            })
        };

        try {
            const response = await fetch('/api/create_payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao criar o pagamento.');
            }

            const preference = await response.json();
            window.location.href = preference.init_point;

        } catch (error) {
            alert(`Erro: ${error.message}`);
            payButton.disabled = false;
            payButton.textContent = 'Pagar com Mercado Pago';
        }
    }

    // --- EXECUÇÃO INICIAL ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            cart = JSON.parse(localStorage.getItem('turboostCart')) || [];
            if (cart.length === 0) {
                window.location.href = '/index.html';
                return;
            }
            
            await fetchAllProducts();
            
            document.getElementById('email').value = user.email;
            renderOrderSummary();
            
            loader.style.display = 'none';
            checkoutContent.classList.remove('hidden');
        } else {
            // Se não estiver logado, volta para a página inicial
            window.location.href = '/index.html';
        }
    });

    // --- EVENT LISTENERS ---
    let cepTimeout;
    cepInput.addEventListener('keyup', () => {
        clearTimeout(cepTimeout);
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length === 8) {
            fetchAddress(cep);
        }
        // Calcula o frete após um pequeno atraso para não sobrecarregar a API
        cepTimeout = setTimeout(fetchShippingOptions, 800);
    });

    payButton.addEventListener('click', createPayment);
});
