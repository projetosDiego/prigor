/**
 * Reúne o CLI do Prisma e TODA a árvore de dependências dele em
 * /prisma-cli/node_modules, para a imagem de runtime levar só isso.
 *
 * Por que isto existe: `node_modules/prisma/build/index.js` já foi um bundle
 * autocontido, e a imagem copiava apenas `node_modules/prisma`. Deixou de ser:
 * a partir do Prisma 6.19 o CLI carrega `@prisma/config`, que depende de
 * `effect` e de mais duas dezenas de pacotes. O container subia e morria no
 * `entrypoint` com `Cannot find module 'effect'`.
 *
 * A lista é calculada, não escrita à mão: numa atualização do Prisma o fecho
 * muda sozinho junto. Se algum pacote esperado sumir, o script falha aqui, no
 * build — que é onde dá para consertar — em vez de no boot em produção.
 */
import fs from 'node:fs';
import path from 'node:path';

// Sobrescrevíveis por argumento para dar para rodar o script fora do build.
const ORIGEM = process.argv[2] ?? '/app/node_modules';
const DESTINO = process.argv[3] ?? '/prisma-cli/node_modules';
const RAIZES = ['prisma'];

/** @param {string} nome @param {Set<string>} vistos */
function coletar(nome, vistos) {
  if (vistos.has(nome)) return;

  const pacote = path.join(ORIGEM, nome, 'package.json');
  if (!fs.existsSync(pacote)) {
    throw new Error(
      `Dependência do CLI do Prisma não encontrada em node_modules: ${nome}. ` +
        'O build para aqui de propósito: seguir gerava uma imagem que só quebraria no boot.',
    );
  }

  vistos.add(nome);
  const json = JSON.parse(fs.readFileSync(pacote, 'utf8'));
  for (const dep of Object.keys(json.dependencies ?? {})) coletar(dep, vistos);
}

const vistos = new Set();
for (const raiz of RAIZES) coletar(raiz, vistos);

// `@prisma/*` ja vai para a imagem pelo seu proprio COPY (sao ~90MB de
// engines). Percorremos essas dependencias para achar o que elas puxam, mas
// nao as copiamos de novo: duplicaria a camada.
const aCopiar = [...vistos].filter((nome) => !nome.startsWith('@prisma/'));

for (const nome of aCopiar) {
  const de = path.join(ORIGEM, nome);
  const para = path.join(DESTINO, nome);
  fs.mkdirSync(path.dirname(para), { recursive: true });
  fs.cpSync(de, para, { recursive: true, dereference: false, verbatimSymlinks: true });
}

console.log(
  `[collect-prisma-cli] ${aCopiar.length} pacotes copiados para ${DESTINO} ` +
    `(${vistos.size - aCopiar.length} de @prisma/ ja vao na imagem por outro COPY)`,
);
