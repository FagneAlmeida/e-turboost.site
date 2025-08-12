// Adicione estas constantes no início do DOMContentLoaded, junto com as outras
const settingsForm = document.getElementById('settings-form');
const logoPreview = document.getElementById('logo-preview');
const pageEditors = document.querySelectorAll('.page-editor');
const cepOrigemInput = document.getElementById('cepOrigem');

// --- FUNÇÕES DE CARREGAMENTO DE DADOS ---

// Crie esta nova função para carregar os dados das configurações
const loadSettingsData = async () => {
    try {
        // Busca todas as configurações e páginas em paralelo
        const [settings, privacy, terms, returns] = await Promise.all([
            api.request('/api/settings'),
            api.request('/api/pages/privacy').catch(() => ({ content: '' })),
            api.request('/api/pages/terms').catch(() => ({ content: '' })),
            api.request('/api/pages/returns').catch(() => ({ content: '' }))
        ]);

        // Preenche os campos do formulário
        if (settings) {
            // Popula os inputs de texto
            for (const key in settings) {
                const input = settingsForm.elements[key];
                if (input) {
                    input.value = settings[key];
                }
            }
            // Exibe a pré-visualização do logo, se existir
            if (settings.logoUrl) {
                logoPreview.src = settings.logoUrl;
                logoPreview.classList.remove('hidden');
            }
        }

        // Preenche os editores de página
        document.getElementById('page-privacy').value = privacy.content;
        document.getElementById('page-terms').value = terms.content;
        document.getElementById('page-returns').value = returns.content;

    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        // Poderíamos mostrar uma notificação de erro aqui
    }
};

// Modifique a função loadInitialData para chamar a nova função
const loadInitialData = async () => {
    try {
        // As chamadas existentes permanecem
        const [productsData, ordersData] = await Promise.all([
            api.request('/api/products'),
            api.request('/api/admin/orders')
        ]);
        
        allProducts = productsData;
        allOrders = ordersData;
        
        if (totalProductsEl) totalProductsEl.textContent = allProducts.length;
        if (totalOrdersEl) totalOrdersEl.textContent = allOrders.length;
        
        renderProducts();
        renderOrders();
        
        // Adiciona a chamada para carregar os dados das configurações
        await loadSettingsData();

    } catch (error) {
        console.error("Erro ao carregar dados do painel:", error);
    }
};


// --- EVENT LISTENERS ---

// Adicione este novo listener para o formulário de configurações
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = settingsForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.textContent = 'A salvar...';
        submitButton.disabled = true;

        try {
            // 1. Salvar configurações gerais e ficheiros (logo/favicon)
            const formData = new FormData(settingsForm);
            await api.request('/api/settings', {
                method: 'POST',
                body: formData // O browser define o Content-Type como multipart/form-data automaticamente
            });

            // 2. Salvar o conteúdo de cada página em paralelo
            const pageSavePromises = [];
            pageEditors.forEach(editor => {
                const pageName = editor.dataset.pageName;
                const content = editor.value;
                const promise = api.request(`/api/admin/pages/${pageName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                pageSavePromises.push(promise);
            });
            await Promise.all(pageSavePromises);

            alert('Configurações salvas com sucesso!'); // Substituir por um modal de notificação se disponível

        } catch (error) {
            console.error('Erro ao salvar configurações:', error);
            alert(`Erro ao salvar: ${error.message}`);
        } finally {
            submitButton.textContent = originalButtonText;
            submitButton.disabled = false;
        }
    });
}

// Adicione este listener para a pré-visualização do logo
const logoFileInput = document.getElementById('logoFile');
if (logoFileInput && logoPreview) {
    logoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                logoPreview.src = event.target.result;
                logoPreview.classList.remove('hidden');
            }
            reader.readAsDataURL(file);
        }
    });
}

// Adicione este listener para a funcionalidade do ViaCEP
if (cepOrigemInput) {
    cepOrigemInput.addEventListener('blur', async (e) => {
        const cep = e.target.value.replace(/\D/g, ''); // Remove não-dígitos
        if (cep.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('CEP não encontrado');
            const data = await response.json();
            if (data.erro) throw new Error('CEP inválido');

            document.getElementById('ruaOrigem').value = data.logradouro;
            document.getElementById('bairroOrigem').value = data.bairro;
            document.getElementById('cidadeOrigem').value = `${data.localidade} / ${data.uf}`;
            document.getElementById('numeroOrigem').focus(); // Move o foco para o número

        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            // Poderia limpar os campos ou mostrar um erro
        }
    });
}
