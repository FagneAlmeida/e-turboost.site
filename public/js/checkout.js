import { firebasePromise } from '/js/app-init.js';

// --- CORREÇÃO: Aguarda a promessa do Firebase no início ---
// Isso garante que 'auth' e 'db' estão disponíveis antes de qualquer outra execução.
const { auth, db } = await firebasePromise.catch(err => {
    console.error("Firebase não inicializado no checkout:", err);
    // Esconde o formulário e mostra uma mensagem de erro crítica na página
    document.body.innerHTML = `<div class="text-center p-10 bg-background-light h-screen"><h1 class="text-2xl text-detail">Erro Crítico</h1><p class="text-text-muted">Não foi possível conectar aos nossos serviços. Por favor, volte mais tarde.</p></div>`;
    return {}; // Retorna um objeto vazio para evitar mais erros.
});

// Só continua se o Firebase foi inicializado corretamente.
if (auth && db) {
    document.addEventListener('DOMContentLoaded', function() {
        // --- ELEMENTOS DO DOM ---
        const cepInput = document.getElementById('cep');
        const ruaInput = document.getElementById('rua');
        const numeroInput = document.getElementById('numero');
        const bairroInput = document.getElementById('bairro');
        const cidadeInput = document.getElementById('cidade');
        const shippingOptionsContainer = document.getElementById('shipping-options');
        const shippingLoader = document.getElementById('shipping-loader');
        const shippingError = document.getElementById('shipping-error');
        const summaryShipping = document.getElementById('summary-shipping');
        const summaryTotal = document.getElementById('summary-total');
        const paymentBtn = document.getElementById('payment-btn');
        const orderSummaryItems = document.getElementById('order-summary-items');
        const customerInfoDisplay = document.getElementById('customer-info-display');


        // --- ESTADO DA APLICAÇÃO ---
        let cart = JSON.parse(localStorage.getItem('turboostCart')) || [];
        let selectedShipping = null;
        let currentUser = null;

        // --- FUNÇÕES ---
        const renderOrderSummary = () => {
            if (cart.length === 0) {
                orderSummaryItems.innerHTML = '<p class="text-text-muted">O seu carrinho está vazio.</p>';
                paymentBtn.disabled = true;
            } else {
                orderSummaryItems.innerHTML = cart.map(item => `
                    <div class="flex justify-between items-center text-sm">
                        <div>
                            <p class="font-semibold text-text-dark">${item.nomeProduto} (x${item.quantity})</p>
                        </div>
                        <span class="font-medium text-text-dark">R$ ${(item.preco * item.quantity).toFixed(2).replace('.', ',')}</span>
                    </div>
                `).join('');
            }
            updateTotals();
        };

        const updateTotals = () => {
            const subtotal = cart.reduce((sum, item) => sum + (item.preco * item.quantity), 0);
            const shippingCost = selectedShipping ? parseFloat(selectedShipping.Valor) : 0;
            const total = subtotal + shippingCost;

            document.getElementById('summary-subtotal').textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
            summaryShipping.textContent = selectedShipping ? `R$ ${shippingCost.toFixed(2).replace('.', ',')}` : 'A calcular...';
            summaryTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
            paymentBtn.disabled = !selectedShipping || cart.length === 0;
        };

        const fetchAddressFromCep = async (cep) => {
            try {
                ruaInput.value = "Buscando...";
                bairroInput.value = "Buscando...";
                cidadeInput.value = "Buscando...";
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.ok) throw new Error('Falha na API de CEP.');
                const data = await response.json();
                if (data.erro) throw new Error('CEP não encontrado.');
                ruaInput.value = data.logradouro;
                bairroInput.value = data.bairro;
                cidadeInput.value = `${data.localidade} - ${data.uf}`;
                numeroInput.focus();
            } catch (error) {
                console.error("Erro ao buscar CEP:", error);
                cidadeInput.value = 'CEP inválido.';
                ruaInput.value = '';
                bairroInput.value = '';
            }
        };

        const fetchShippingOptions = async () => {
            const cep = cepInput.value.replace(/\D/g, '');
            if (cep.length !== 8) return;

            shippingLoader.classList.remove('hidden');
            shippingError.classList.add('hidden');
            shippingOptionsContainer.innerHTML = '';
            selectedShipping = null;
            updateTotals();

            try {
                const response = await fetch('/api/shipping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cep, items: cart })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Erro ao calcular o frete.');

                if (data.length === 0) {
                    shippingOptionsContainer.innerHTML = '<p class="text-text-muted">Nenhuma opção de frete encontrada para este CEP.</p>';
                    return;
                }

                shippingOptionsContainer.innerHTML = data.map(rate => `
                    <div class="border rounded-md p-4 flex justify-between items-center cursor-pointer hover:border-accent transition-all shipping-rate" data-rate='${JSON.stringify(rate)}'>
                        <div>
                            <p class="font-bold text-text-dark">${rate.Nome}</p>
                            <p class="text-sm text-text-muted">Prazo: ${rate.PrazoEntrega} dias</p>
                        </div>
                        <span class="font-bold text-lg text-text-dark">R$ ${parseFloat(rate.Valor).toFixed(2).replace('.', ',')}</span>
                    </div>
                `).join('');
            } catch (error) {
                shippingError.textContent = error.message;
                shippingError.classList.remove('hidden');
            } finally {
                shippingLoader.classList.add('hidden');
            }
        };

        const createPaymentPreference = async () => {
            if (!selectedShipping || !currentUser || cart.length === 0) {
                alert("Por favor, selecione um frete e verifique os seus itens.");
                return;
            }

            paymentBtn.textContent = 'A redirecionar...';
            paymentBtn.disabled = true;
            
            // --- CORREÇÃO: Guarda o carrinho antes de tentar o pagamento ---
            const cartBackup = localStorage.getItem('turboostCart');

            try {
                const response = await fetch('/api/create-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cartItems: cart,
                        shippingOption: selectedShipping,
                        customerInfo: { email: currentUser.email, name: currentUser.displayName }
                    })
                });
                const preference = await response.json();
                if (!response.ok) throw new Error(preference.message || "Erro desconhecido ao criar pagamento.");

                // Limpa o carrinho apenas se a criação da preferência for bem-sucedida
                localStorage.removeItem('turboostCart');
                window.location.href = preference.init_point;

            } catch (error) {
                alert(`Erro ao criar pagamento: ${error.message}`);
                // --- CORREÇÃO: Restaura o carrinho em caso de erro ---
                if (cartBackup) {
                    localStorage.setItem('turboostCart', cartBackup);
                }
                paymentBtn.textContent = 'Ir para o Pagamento';
                paymentBtn.disabled = false;
            }
        };

        // --- EVENT LISTENERS ---
        const debounce = (func, delay) => {
            let timeoutId;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func.apply(this, args), delay);
            };
        };
        
        const debouncedFetchShipping = debounce(fetchShippingOptions, 500);

        cepInput.addEventListener('input', e => {
            const cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) {
                fetchAddressFromCep(cep);
                debouncedFetchShipping();
            }
        });

        shippingOptionsContainer.addEventListener('click', (e) => {
            const rateElement = e.target.closest('.shipping-rate');
            if (rateElement) {
                document.querySelectorAll('.shipping-rate').forEach(el => el.classList.remove('ring-2', 'ring-accent', 'border-accent'));
                rateElement.classList.add('ring-2', 'ring-accent', 'border-accent');
                selectedShipping = JSON.parse(rateElement.dataset.rate);
                updateTotals();
            }
        });
        
        paymentBtn.addEventListener('click', createPaymentPreference);

        // --- INICIALIZAÇÃO ---
        auth.onAuthStateChanged(user => {
            // --- CORREÇÃO: Validação de utilizador ---
            if (user) {
                currentUser = user;
                // Exibe as informações do cliente
                document.getElementById('customer-name').textContent = user.displayName || 'Utilizador';
                document.getElementById('customer-email').textContent = user.email;
                customerInfoDisplay.classList.remove('hidden');
                
                renderOrderSummary();
            } else {
                // Se não houver utilizador, impede a continuação
                alert("A sua sessão expirou ou não está autenticado. Por favor, faça login novamente para continuar.");
                window.location.href = '/';
            }
        });
    });
}
