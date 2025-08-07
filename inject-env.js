// inject-env.js
const fs = require('fs');

const filePath = './public/js/app-init.js';
const placeholder = '__API_AUTH_TOKEN_PLACEHOLDER__';
const apiToken = process.env.API_AUTH_TOKEN;

if (!apiToken) {
  console.error('ERRO: A variável de ambiente API_AUTH_TOKEN não foi definida!');
  process.exit(1); // Sai do processo com erro
}

try {
  let fileContent = fs.readFileSync(filePath, 'utf8');

  if (fileContent.includes(placeholder)) {
    fileContent = fileContent.replace(placeholder, apiToken);
    fs.writeFileSync(filePath, fileContent);
    console.log(`Sucesso: Token injetado em ${filePath}`);
  } else {
    console.warn(`Aviso: Placeholder "${placeholder}" não encontrado em ${filePath}.`);
  }
} catch (error) {
  console.error(`Erro ao processar o ficheiro ${filePath}:`, error);
  process.exit(1);
}