/** @type {import('tailwindcss').Config} */
module.exports = {
  // A seção 'content' informa ao Tailwind onde procurar por classes CSS.
  // Já está corretamente configurado para monitorar seus arquivos HTML e JS.
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],

  // --- CORREÇÃO: Safelist refinada ---
  // A 'safelist' garante que classes dinâmicas não sejam removidas no build.
  safelist: [
    'open', // Para modais e dropdowns
    'add-to-cart-btn',
    'remove-from-cart-btn',
    'quantity-input',
    // Classes de estilização que podem ser usadas dinamicamente
    'bg-primary',
    'bg-secondary',
    'bg-accent',
    'text-accent',
    'border-accent',
    'bg-success',
    'bg-detail',
    'text-red-500',
    'text-green-500',
  ],

  theme: {
    extend: {
      // --- CORREÇÃO: Paleta de cores expandida e semântica ---
      // Mapeia as cores para serem usadas como classes do Tailwind.
      // A estrutura foi melhorada para incluir variações como 'hover'.
      colors: {
        'primary': {
          DEFAULT: '#1a1a1a', // Preto principal
          '700': '#0d0d0d',   // Variação mais escura
          '500': '#2c2c2c',   // Variação mais clara
        },
        'secondary': '#4a4a4a', // Cinza escuro para elementos secundários
        'accent': {
          DEFAULT: '#FFC700', // Amarelo principal para destaque
          'hover': '#E6B300', // Tom mais escuro para efeito hover
        },
        'detail': '#E53935',    // Vermelho para detalhes, erros ou promoções
        'success': '#4CAF50',  // Verde para mensagens de sucesso
        'background': {
          DEFAULT: '#FFFFFF', // Fundo principal claro
          'light': '#F5F5F5',  // Tom de cinza muito claro
        },
        'text': {
          'light': '#FFFFFF',  // Texto sobre fundos escuros
          'dark': '#1a1a1a',   // Texto sobre fundos claros
          'muted': '#6c757d',  // Texto com menos destaque
        },
      },
      // --- CORREÇÃO: Fontes expandidas ---
      // Adicionada a fonte 'open-sans' conforme sugerido.
      fontFamily: {
        'anton': ['Anton', 'sans-serif'],
        'roboto': ['Roboto', 'sans-serif'],
        'open-sans': ['"Open Sans"', 'sans-serif'],
      }
    },
  },

  // Adicionar plugins pode estender as funcionalidades do Tailwind.
  // O plugin de formulários é muito útil para estilizar inputs, selects, etc.
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
