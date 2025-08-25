/** @type {import('tailwindcss').Config} */
module.exports = {
  // A seção 'content' é crucial. Ela informa ao Tailwind para analisar todos os
  // ficheiros .html e .js dentro da pasta 'public' e suas subpastas em busca
  // de classes de utilitário. Isto garante que apenas o CSS que usamos
  // seja incluído no ficheiro final (output.css), otimizando o desempenho.
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],

  // A 'safelist' é uma medida de segurança. Ela impede que o Tailwind remova
  // classes que podem ser adicionadas dinamicamente via JavaScript e que,
  // por isso, não são visíveis na análise inicial dos ficheiros.
  safelist: [
    'open', // Usado para controlar a visibilidade de modais e painéis.
    // Adicione aqui outras classes que sejam geradas dinamicamente.
  ],

  theme: {
    // A seção 'extend' permite-nos adicionar novas configurações ao tema
    // padrão do Tailwind sem substituir os valores originais.
    extend: {
      // Aqui definimos a nossa paleta de cores personalizada e semântica.
      // Em vez de usar 'gray-800', podemos usar 'primary-dark', que é mais
      // significativo e fácil de manter.
      colors: {
        'primary': '#1a1a1a',          // Cor de fundo principal (preto suave)
        'primary-light': '#2c2c2c',    // Variação mais clara para painéis, cards
        'primary-dark': '#111827',     // Variação mais escura para fundos profundos
        'secondary': '#4a4a4a',        // Cinza escuro para elementos secundários
        'accent': '#FFC700',           // Amarelo principal para destaque, botões, links
        'accent-hover': '#E6B300',     // Tom mais escuro do amarelo para efeito hover
        'detail': '#E53935',           // Vermelho para detalhes, erros ou ações destrutivas
        'success': '#4CAF50',         // Verde para mensagens de sucesso
        'text-light': '#FFFFFF',       // Cor de texto principal sobre fundos escuros
        'text-dark': '#1a1a1a',        // Cor de texto principal sobre fundos claros
        'text-muted': '#9CA3AF',       // Cor de texto com menos destaque (cinza claro)
      },
      // Definimos as nossas fontes personalizadas, garantindo que elas
      // sejam carregadas e aplicadas corretamente em todo o site.
      fontFamily: {
        'anton': ['Anton', 'sans-serif'],
        'inter': ['Inter', 'sans-serif'],
      }
    },
  },

  // Plugins estendem as funcionalidades do Tailwind.
  // O '@tailwindcss/forms' é um plugin oficial que redefine os estilos
  // padrão dos elementos de formulário, tornando-os muito mais fáceis
  // de estilizar com classes de utilitário.
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'), // Útil para vídeos responsivos
  ],
}
