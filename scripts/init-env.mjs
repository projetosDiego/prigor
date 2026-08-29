/**
 * Cria o .env de desenvolvimento já pronto para rodar.
 *
 * Existe porque o passo manual de gerar e colar o JWT_SECRET é o primeiro
 * lugar onde dá para errar — e o sintoma (erro 500 na primeira página) não
 * aponta para a causa.
 *
 *   npm run env:init
 *
 * Nunca sobrescreve um .env existente sem --force.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const DESTINO = '.env';
const MODELO = '.env.example';
const forcar = process.argv.includes('--force');

if (existsSync(DESTINO) && !forcar) {
  console.log(`${DESTINO} já existe — nada foi alterado.`);
  console.log('Use `npm run env:init -- --force` para recriar do zero.');
  process.exit(0);
}

if (!existsSync(MODELO)) {
  console.error(`Não achei ${MODELO}.`);
  process.exit(1);
}

if (existsSync(DESTINO) && forcar) {
  copyFileSync(DESTINO, `${DESTINO}.backup`);
  console.log(`.env anterior salvo como ${DESTINO}.backup`);
}

const segredo = randomBytes(32).toString('hex');

const conteudo = readFileSync(MODELO, 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${segredo}"`)
  // Em desenvolvimento a prospecção roda simulada até existir chave real.
  .replace(/^# ALLOW_MOCK_PLACES=true$/m, 'ALLOW_MOCK_PLACES=true')
  .replace(/^ADMIN_EMAIL=.*$/m, 'ADMIN_EMAIL="admin@prigor.local"')
  .replace(/^ADMIN_PASSWORD=.*$/m, 'ADMIN_PASSWORD="troque-esta-senha-local"');

writeFileSync(DESTINO, conteudo);

console.log(`
.env criado com JWT_SECRET gerado (${segredo.length} caracteres).

Próximos passos:
  npm run db:up
  npm run db:deploy
  npm run db:seed:demo
  npm run dev
`);
