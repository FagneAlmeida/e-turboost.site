// public/js/payment-feedback.js
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    const updateTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value || 'N/A';
        }
    };

    // Dados comuns a todas as páginas de feedback
    const paymentId = params.get('payment_id');
    const status = params.get('status');
    const externalReference = params.get('external_reference');
    const orderId = params.get('order_id');

    updateTextContent('payment_id', paymentId);
    updateTextContent('status', status);
    updateTextContent('external_reference', externalReference);
    updateTextContent('order-id', orderId);

    // Limpa o carrinho apenas na página de sucesso
    if (document.body.id === 'page-success') {
        localStorage.removeItem('turboostCart');
        console.log('Carrinho limpo após compra bem-sucedida.');
    }
});