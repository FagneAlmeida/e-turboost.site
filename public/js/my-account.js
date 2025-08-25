import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const loader = document.getElementById('loading-orders');
    const ordersContainer = document.getElementById('orders-container');
    const userDisplayName = document.getElementById('user-display-name');
    const userEmail = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');

    // --- ESTADO DA APLICAÇÃO ---
    let currentUser = null;

    // --- AUTENTICAÇÃO ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            // Preenche as informações do utilizador no cabeçalho da página
            if (userDisplayName) userDisplayName.textContent = user.displayName || user.email.split('@')[0];
            if (userEmail) userEmail.textContent = user.email;
            
            loadOrderHistory();
        } else {
            // Se não houver utilizador, redireciona para a página de login
            window.location.href = '/login';
        }
    });
    
    // --- LÓGICA DE LOGOUT ---
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth).then(() => {
                window.location.href = '/';
            }).catch((error) => {
                console.error('Erro ao fazer logout:', error);
            });
        });
    }

    // --- LÓGICA DE DADOS E RENDERIZAÇÃO ---
    const loadOrderHistory = async () => {
        if (!currentUser) return;

        loader.classList.remove('hidden');
        ordersContainer.innerHTML = ''; // Limpa pedidos antigos

        try {
            const idToken = await currentUser.getIdToken(true);
            const response = await fetch('/api/my-account/orders', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao carregar histórico.');
            }

            const data = await response.json();
            renderOrderHistory(data.orders || []);

        } catch (error) {
            console.error("Erro ao carregar histórico de pedidos:", error);
            ordersContainer.innerHTML = '<p class="text-red-400">Não foi possível carregar o seu histórico de pedidos.</p>';
        } finally {
            loader.classList.add('hidden');
        }
    };

    const renderOrderHistory = (orders) => {
        if (orders.length === 0) {
            ordersContainer.innerHTML = '<p class="text-gray-400">Você ainda não fez nenhum pedido.</p>';
            return;
        }

        orders.forEach(order => {
            const orderDate = new Date(order.createdAt._seconds * 1000).toLocaleDateString('pt-BR');
            const orderDiv = document.createElement('div');
            orderDiv.className = 'bg-gray-800 p-6 rounded-lg';
            
            let itemsHtml = order.items.map(item => `
                <div class="flex items-center gap-4 py-2">
                    <div class="flex-grow">
                        <p class="font-semibold text-white">${item.name}</p>
                        <p class="text-sm text-gray-400">Quantidade: ${item.quantity}</p>
                    </div>
                    <p class="text-gray-300">R$ ${(item.price * item.quantity).toFixed(2)}</p>
                </div>
            `).join('');

            orderDiv.innerHTML = `
                <div class="flex justify-between items-center border-b border-gray-700 pb-3 mb-3 flex-wrap gap-4">
                    <div>
                        <p class="text-sm text-gray-400">Pedido #${order.orderId.substring(0, 8)}</p>
                        <p class="font-semibold text-white">${orderDate}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-400">Total</p>
                        <p class="font-bold text-xl text-yellow-400">R$ ${order.totalAmount.toFixed(2)}</p>
                    </div>
                </div>
                <div class="space-y-2">${itemsHtml}</div>
                <div class="text-right mt-3">
                    <span class="px-3 py-1 text-sm font-semibold rounded-full ${order.status === 'approved' ? 'bg-green-500 text-white' : 'bg-yellow-500 text-gray-900'}">
                        ${order.status || 'Pendente'}
                    </span>
                </div>
            `;
            ordersContainer.appendChild(orderDiv);
        });
    };
});
