/**
 * Monta o ambiente de desenvolvimento do zero, em um comando.
 *
 *   npm run bootstrap
 *
 * Existe porque o caminho manual tem sete passos e pelo menos tres deles
 * falham de um jeito que nao aponta para a causa: Docker parado, .env sem
 * segredo, client do Prisma nao gerado. Aqui cada passo confere o
 * pre-requisito antes de rodar e, quando quebra, diz o que fazer.
 *
 * Rodar de novo em cima de um ambiente ja montado nao apaga nada: o seed de
 * demonstracao so roda se o banco ainda estiver sem usuario.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const NODE_MINIMO = 22;
const NEGRITO = '\x1b[1m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const FIM_COR = '\x1b[0m';

let etapa = 0;

function passo(titulo) {
  etapa += 1;
  console.log(`\n${NEGRITO}${etapa}. ${titulo}${FIM_COR}`);
}

function ok(mensagem) {
  console.log(`   ${mensagem}`);
}

function parar(problema, comoResolver) {
  console.error(`\n${VERMELHO}Parei aqui: ${problema}${FIM_COR}\n`);
  console.error(`${comoResolver.trim()}\n`);
  process.exit(1);
}

function rodar(comando) {
  console.log(`${CINZA}   $ ${comando}${FIM_COR}`);
  execSync(comando, { stdio: 'inherit' });
}

function capturar(comando) {
  return execSync(comando, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

// Pausa sincrona que funciona em macOS, Linux e Windows (nada de `sleep`).
function esperarSegundos(segundos) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, segundos * 1000);
}

function existe(comando) {
  try {
    capturar(`${comando} --version`);
    return true;
  } catch {
    return false;
  }
}

// ── 1. Node ────────────────────────────────────────────────────────────────
passo('Conferindo o Node');

const versaoNode = Number(process.versions.node.split('.')[0]);
if (versaoNode < NODE_MINIMO) {
  parar(
    `este projeto precisa do Node ${NODE_MINIMO} ou maior, e voce esta no ${process.versions.node}`,
    `Com nvm:

  nvm install 22
  nvm use 22

Sem nvm, baixe em https://nodejs.org (versao LTS).`,
  );
}
ok(`Node ${process.versions.node}`);

// ── 2. Docker ──────────────────────────────────────────────────────────────
passo('Conferindo o Docker');

if (!existe('docker')) {
  parar(
    'o Docker nao esta instalado',
    `O banco de desenvolvimento roda em container. Instale o Docker Desktop:

  macOS / Windows:  https://www.docker.com/products/docker-desktop
  Linux:            https://docs.docker.com/engine/install

Depois de instalar, abra o Docker Desktop e rode este comando de novo.`,
  );
}

try {
  capturar('docker info');
} catch {
  parar(
    'o Docker esta instalado mas nao esta rodando',
    `Abra o Docker Desktop e espere o icone parar de piscar. No Linux:

  sudo systemctl start docker`,
  );
}

try {
  capturar('docker compose version');
} catch {
  parar(
    'o subcomando "docker compose" nao existe nesta instalacao',
    `Voce provavelmente tem o docker-compose antigo (com hifen). Atualize o
Docker para uma versao com o Compose v2 embutido.`,
  );
}
ok(capturar('docker --version'));

// ── 3. .env ────────────────────────────────────────────────────────────────
passo('Preparando o .env');

if (existsSync('.env')) {
  ok('.env ja existe, mantido como esta');
} else {
  rodar('node scripts/init-env.mjs');
}

// ── 4. Dependencias ────────────────────────────────────────────────────────
passo('Instalando as dependencias');
rodar(existsSync('package-lock.json') ? 'npm ci' : 'npm install');

// ── 5. Banco ───────────────────────────────────────────────────────────────
passo('Subindo o Postgres');

try {
  rodar('docker compose up -d');
} catch {
  parar(
    'o container do banco nao subiu',
    `A causa mais comum e a porta 5432 ja estar ocupada por outro Postgres.
Veja quem esta usando:

  docker ps
  lsof -i :5432

Se for um container antigo do proprio projeto:

  docker stop prigor-db && docker rm prigor-db`,
  );
}

// O container sobe antes do Postgres aceitar conexao. Sem esperar aqui, a
// migration falha com "Can't reach database server" e parece erro de config.
passo('Esperando o banco aceitar conexao');

const LIMITE_SEGUNDOS = 90;
const inicio = Date.now();
let pronto = false;

while ((Date.now() - inicio) / 1000 < LIMITE_SEGUNDOS) {
  try {
    capturar('docker compose exec -T db pg_isready -U postgres');
    pronto = true;
    break;
  } catch {
    esperarSegundos(2);
  }
}

if (!pronto) {
  parar(
    `o Postgres nao respondeu em ${LIMITE_SEGUNDOS} segundos`,
    `Veja o que o container esta dizendo:

  docker compose logs db`,
  );
}
ok('banco de pe');

// ── 6. Prisma ──────────────────────────────────────────────────────────────
passo('Gerando o client do Prisma');
rodar('npx prisma generate');

passo('Criando as tabelas');
rodar('npx prisma migrate deploy');

// ── 7. Dados de demonstracao ───────────────────────────────────────────────
passo('Populando o cenario de teste');

let usuarios = '0';
try {
  usuarios = capturar(
    'docker compose exec -T db psql -U postgres -d prigor -tAc \'select count(*) from usuarios\'',
  );
} catch {
  // Se a contagem falhar, e mais seguro nao semear do que duplicar pedido.
  usuarios = '?';
}

if (usuarios === '0') {
  rodar('npm run db:seed:demo');
} else if (usuarios === '?') {
  ok('nao consegui conferir se o banco ja tem dado — pulei o seed.');
  ok('se o banco estiver vazio, rode: npm run db:seed:demo');
} else {
  ok(`o banco ja tem ${usuarios} usuario(s) — seed pulado, nada foi sobrescrito`);
}

// ── Fim ────────────────────────────────────────────────────────────────────
console.log(`
${NEGRITO}Ambiente pronto.${FIM_COR}

  npm run dev        e abra http://localhost:3000

Entrar:
  administrador   admin@prigor.local      demo12345678
  vendedor        vendedor@prigor.local   demo12345678

Antes de qualquer commit:
  npm run verify   (tipos, uso do Prisma, lint e os testes de regra)

Roteiro de conferencia tela a tela em docs/TESTE-LOCAL.md.
`);
