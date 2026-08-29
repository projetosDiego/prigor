/**
 * Confere estaticamente o uso do Prisma contra o schema.
 *
 * Existe porque neste projeto os tipos do Prisma só ficam disponíveis depois de
 * `prisma generate`, e mesmo com eles é fácil escrever `prisma.pedido` quando o
 * modelo se chama `order`. Este script lê o `schema.prisma`, encontra todas as
 * chamadas `prisma.<modelo>.<método>({...})` no código e valida:
 *
 *   - o modelo existe;
 *   - o método existe;
 *   - todo campo usado em `select`/`include` existe no modelo — inclusive nos
 *     blocos aninhados, resolvendo a relação para o modelo de destino.
 *
 * Não substitui teste de integração; pega a classe de erro mais comum em um
 * segundo. Rode com `npm run check:prisma`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ESCALARES = new Set([
  'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Decimal', 'Json', 'Bytes', 'BigInt',
]);

const METODOS = new Set([
  'findMany', 'findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow',
  'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
]);

/** Chaves de opção do Prisma que não são campo do modelo. */
const OPCOES = new Set([
  'select', 'include', 'where', 'orderBy', 'take', 'skip', 'cursor', 'distinct',
  'data', 'by', '_count', '_sum', '_avg', '_min', '_max', 'omit', 'having',
  'create', 'update', 'connect', 'connectOrCreate', 'disconnect', 'set',
  'deleteMany', 'updateMany', 'upsert', 'createMany', 'relationLoadStrategy',
]);

// ─── Schema ─────────────────────────────────────────────────────────────────

function lerSchema(caminho) {
  const schema = readFileSync(caminho, 'utf8');
  const enums = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const porNome = new Map();

  for (const bloco of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const nome = bloco[1];
    const campos = new Map(); // campo -> modelo de destino, ou null se escalar

    for (const linha of bloco[2].split('\n')) {
      const texto = linha.trim();
      if (!texto || texto.startsWith('//') || texto.startsWith('@@')) continue;

      const m = texto.match(/^(\w+)\s+(\S+)/);
      if (!m) continue;

      const [, campo, tipoBruto] = m;
      const tipo = tipoBruto.replace(/[?[\]]/g, '');
      const ehRelacao = /^[A-Z]/.test(tipo) && !ESCALARES.has(tipo) && !enums.has(tipo);
      campos.set(campo, ehRelacao ? tipo : null);
    }

    porNome.set(nome, campos);
  }

  // O acesso no código é camelCase: `prisma.orderItem` para o modelo `OrderItem`.
  const porAcesso = new Map();
  for (const [nome, campos] of porNome) {
    porAcesso.set(nome[0].toLowerCase() + nome.slice(1), { nome, campos });
  }

  return { porNome, porAcesso };
}

// ─── Leitura de objeto literal ──────────────────────────────────────────────

/** Recorta o trecho entre `{` em `inicio` e a chave que o fecha. */
function recortarObjeto(texto, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Chaves de primeiro nível de um objeto literal, com o valor de cada uma
 * quando o valor é outro objeto.
 */
function chavesDeTopo(objeto) {
  const corpo = objeto.slice(1, -1);
  const saida = [];
  let profundidade = 0;
  let emTexto = null;

  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];

    if (emTexto) {
      if (c === emTexto && corpo[i - 1] !== '\\') emTexto = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { emTexto = c; continue; }
    if (c === '{' || c === '[' || c === '(') { profundidade++; continue; }
    if (c === '}' || c === ']' || c === ')') { profundidade--; continue; }

    if (profundidade !== 0) continue;

    // início de uma chave no nível de topo
    const resto = corpo.slice(i);
    const m = resto.match(/^(\w+)\s*:/);
    if (!m) continue;
    // precisa estar no começo de um item (depois de vírgula ou do início)
    const antes = corpo.slice(0, i).replace(/\s+$/, '');
    if (antes && !antes.endsWith(',') && !antes.endsWith('{')) continue;

    const chave = m[1];
    const depoisDosDoisPontos = i + m[0].length;
    const proximoNaoBranco = corpo.slice(depoisDosDoisPontos).match(/^\s*/)[0].length + depoisDosDoisPontos;

    let valor = null;
    if (corpo[proximoNaoBranco] === '{') {
      valor = recortarObjeto(corpo, proximoNaoBranco);
    }

    saida.push({ chave, valor });
    i = depoisDosDoisPontos - 1;
  }

  return saida;
}

// ─── Validação ──────────────────────────────────────────────────────────────

function validarProjecao(objeto, modelo, contexto, schema, problemas, registrar) {
  const meta = schema.porNome.get(modelo);
  if (!meta) return;


  for (const { chave, valor } of chavesDeTopo(objeto)) {
    if (OPCOES.has(chave)) {
      // `select` dentro de `include`, por exemplo: continua no mesmo modelo.
      if (valor && (chave === 'select' || chave === 'include')) {
        validarProjecao(valor, modelo, contexto, schema, problemas, registrar);
      }
      continue;
    }

    if (!meta.has(chave)) {
      registrar(problemas, `${contexto}: campo "${chave}" não existe em ${modelo}`);
      continue;
    }

    const destino = meta.get(chave);
    if (valor && destino) {
      validarProjecao(valor, destino, `${contexto} → ${chave}`, schema, problemas, registrar);
    }
  }
}

function listarArquivos(dir) {
  const saida = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next') continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...listarArquivos(caminho));
    else if (/\.tsx?$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

function main() {
  const schema = lerSchema('prisma/schema.prisma');
  const arquivos = [...listarArquivos('src'), ...listarArquivos('prisma')];
  const problemas = [];

  for (const arquivo of arquivos) {
    const conteudo = readFileSync(arquivo, 'utf8');

    for (const m of conteudo.matchAll(/\b(?:prisma|tx)\.(\w+)\.(\w+)\s*\(/g)) {
      const [, acesso, metodo] = m;
      if (acesso.startsWith('$')) continue;

      const linha = conteudo.slice(0, m.index).split('\n').length;
      const registrar = (lista, msg) => lista.push(`${arquivo}:${linha}  ${msg}`);

      const modelo = schema.porAcesso.get(acesso);
      if (!modelo) {
        registrar(problemas, `modelo "${acesso}" não existe no schema`);
        continue;
      }
      if (!METODOS.has(metodo)) {
        registrar(problemas, `método "${metodo}" desconhecido em ${acesso}`);
        continue;
      }

      const abre = conteudo.indexOf('{', m.index + m[0].length - 1);
      if (abre === -1) continue;
      // só analisa quando o argumento começa logo após o parêntese
      const entre = conteudo.slice(m.index + m[0].length, abre).trim();
      if (entre !== '') continue;

      const args = recortarObjeto(conteudo, abre);
      if (!args) continue;

      for (const { chave, valor } of chavesDeTopo(args)) {
        if ((chave === 'select' || chave === 'include') && valor) {
          validarProjecao(valor, modelo.nome, `${acesso}.${chave}`, schema, problemas, registrar);
        }
      }
    }
  }

  if (problemas.length === 0) {
    console.log(
      `Uso do Prisma conferido: ${schema.porAcesso.size} modelos, ${arquivos.length} arquivos, nenhum problema.`,
    );
    return;
  }

  console.error(`${problemas.length} problema(s):\n`);
  for (const p of problemas) console.error(`  ${p}`);
  process.exitCode = 1;
}

main();
