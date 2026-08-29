/**
 * Confere o .env antes de subir o servidor.
 *
 * Roda como `predev`, então um .env incompleto falha na hora com uma
 * mensagem clara, em vez de virar erro 500 no navegador na primeira página.
 */
import { existsSync, readFileSync } from 'node:fs';

const ARQUIVO = '.env';

if (!existsSync(ARQUIVO)) {
  console.error(`
Falta o arquivo .env.

  cp .env.example .env
  openssl rand -hex 32     # cole o resultado em JWT_SECRET
`);
  process.exit(1);
}

const valores = new Map();
for (const linha of readFileSync(ARQUIVO, 'utf8').split('\n')) {
  const texto = linha.trim();
  if (!texto || texto.startsWith('#') || !texto.includes('=')) continue;
  const [chave, ...resto] = texto.split('=');
  valores.set(chave.trim(), resto.join('=').trim().replace(/^["']|["']$/g, ''));
}

const problemas = [];

const segredo = valores.get('JWT_SECRET') ?? '';
if (!segredo) {
  problemas.push(
    'JWT_SECRET está vazio.\n' +
      '     Gere um com:  openssl rand -hex 32\n' +
      '     e cole no .env (não no .env.example).',
  );
} else if (segredo.length < 32) {
  problemas.push(
    `JWT_SECRET tem ${segredo.length} caracteres; o mínimo é 32.\n` +
      '     Gere um novo com:  openssl rand -hex 32',
  );
} else if (segredo.startsWith('troque-isto')) {
  problemas.push('JWT_SECRET ainda é o valor de exemplo. Gere o seu com: openssl rand -hex 32');
}

if (!valores.get('DATABASE_URL')) {
  problemas.push('DATABASE_URL está vazio. Use a linha que veio no .env.example.');
}

if (problemas.length > 0) {
  console.error('\nO .env está incompleto:\n');
  for (const p of problemas) console.error(`  •  ${p}\n`);
  console.error('Corrija e rode de novo.\n');
  process.exit(1);
}

console.log('.env conferido.');
