#!/usr/bin/env node
/**
 * Gera o comando para ligar uma EMPRESA ADICIONAL (outro CNPJ) no servidor:
 * certificado A1 (base64) + senha, aplicativo Sicoob e chave da Notaas.
 * Pergunta tudo aqui (senha e chave com digitação oculta) e grava o comando
 * pronto em ../certificado/COMANDO-VPS-<PREFIXO>.txt. Nada é mostrado na tela
 * e o .env deste computador NÃO é alterado.
 *
 *   npm run empresa:comando-vps
 *
 * O prefixo tem de ser o mesmo cadastrado na tela (Configuração Fiscal →
 * Empresas emissoras → "Prefixo da configuração no servidor").
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const certDir = path.resolve(root, '..', 'certificado');

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    const isTTY = Boolean(stdin.isTTY);
    if (isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = () => {
      if (isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish();
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u0008' || ch === '\u007f') {
          if (value.length) {
            value = value.slice(0, -1);
            if (isTTY) process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch === '\u001b') continue;
        value += ch;
        if (isTTY) process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

function certInfo(pfx, passphrase) {
  const ctx = tls.createSecureContext({ pfx, passphrase });
  const socket = new tls.TLSSocket(null, { secureContext: ctx });
  const der = socket.getCertificate()?.raw;
  socket.destroy();
  if (!der) throw new Error('Certificado sem conteúdo.');
  return new crypto.X509Certificate(der);
}

// ─── Perguntas ──────────────────────────────────────────────────────────────

console.log('Configurar empresa adicional (outro CNPJ) no servidor.\n');
const prefix = ((await ask('Prefixo da empresa [PRISCILLA]: ')) || 'PRISCILLA').toUpperCase().replace(/[^A-Z0-9]/g, '');
if (!prefix) {
  console.error('Prefixo inválido.');
  process.exit(1);
}

const pfxFiles = fs.existsSync(certDir) ? fs.readdirSync(certDir).filter((f) => /\.(pfx|p12)$/i.test(f)) : [];
if (!pfxFiles.length) {
  console.error(`Nenhum certificado .pfx em ${certDir}`);
  process.exit(1);
}
console.log('\nCertificados na pasta:');
pfxFiles.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
const suggested = pfxFiles.findIndex((f) => f.endsWith('-moderno.pfx') && !/64189960000124/.test(f));
const pick = await ask(`Número do certificado DESTA empresa (use o "-moderno")${suggested >= 0 ? ` [${suggested + 1}]` : ''}: `);
const idx = (pick ? Number(pick) : suggested + 1) - 1;
const pfxName = pfxFiles[idx];
if (!pfxName) {
  console.error('Opção inválida.');
  process.exit(1);
}
const pfx = fs.readFileSync(path.join(certDir, pfxName));

let password = '';
let cert = null;
for (let attempt = 1; attempt <= 3 && !cert; attempt++) {
  password = await askHidden('Senha do certificado (não aparece na tela): ');
  try {
    cert = certInfo(pfx, password);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/unsupported/i.test(msg)) {
      console.error('Certificado em formato antigo. Escolha o arquivo "-moderno" (gere com: npm run cert:converter).');
      process.exit(1);
    }
    console.error(attempt < 3 ? 'Senha incorreta. Tente de novo.' : 'Senha incorreta 3 vezes. Nada foi gerado.');
  }
}
if (!cert) process.exit(1);
const cn = (cert.subject.split('\n').find((l) => l.startsWith('CN=')) ?? cert.subject).replace('CN=', '');
console.log(`  ✔ Certificado de: ${cn} (válido até ${new Date(cert.validTo).toLocaleDateString('pt-BR')})\n`);

const clientId = await ask('Client ID do aplicativo Sicoob desta empresa (Enter = pular boleto): ');
const conta = clientId ? await ask('Conta corrente (ex.: 37766-0): ') : '';
const numeroCliente = clientId ? await ask('Código do beneficiário (do boleto; Enter se ainda não tiver): ') : '';
const notaas = await askHidden('Chave da API da Notaas desta empresa (ntaas_..., Enter = pular nota): ');
if (notaas && !/^ntaas_[A-Za-z0-9_-]{16,}$/.test(notaas)) {
  console.error('Isso não parece uma chave da Notaas (começa com ntaas_). Nada foi gerado.');
  process.exit(1);
}

// ─── Comando ────────────────────────────────────────────────────────────────

const P = `EMPRESA_${prefix}_`;
const values = {
  [`${P}SICOOB_CERT_BASE64`]: pfx.toString('base64'),
  [`${P}SICOOB_CERT_PASSWORD`]: password,
  ...(clientId ? { [`${P}SICOOB_CLIENT_ID`]: clientId } : {}),
  ...(conta ? { [`${P}SICOOB_CONTA_CORRENTE`]: conta } : {}),
  ...(numeroCliente ? { [`${P}SICOOB_NUMERO_CLIENTE`]: numeroCliente } : {}),
  ...(notaas ? { [`${P}FISCAL_API_TOKEN`]: notaas } : {}),
};
for (const [k, v] of Object.entries(values)) {
  if (v.includes("'") || /[\r\n]/.test(v)) {
    console.error(`${k} tem aspas simples ou quebra de linha; não dá para gravar no .env.`);
    process.exit(1);
  }
}
const block = '\n' + Object.entries(values).map(([k, v]) => `${k}='${v}'`).join('\n') + '\n';
const b64 = Buffer.from(block, 'utf8').toString('base64');
const command =
  `cd /opt/prigor && cp .env .env.bak.$(date +%s) && sed -i '/^${P}/d' .env` +
  ` && echo '${b64}' | base64 -d >> .env` +
  ` && docker compose -f docker-compose.prod.yml --env-file .env up -d` +
  ` && history -c && echo 'EMPRESA ${prefix} CONFIGURADA NO SERVIDOR'`;

const out = path.join(certDir, `COMANDO-VPS-${prefix}.txt`);
fs.writeFileSync(out, command + '\n');
console.log(`\n✔ Comando gerado em: ${out}`);
console.log('  Abra no Bloco de Notas, Ctrl+A, Ctrl+C e cole no terminal da VPS.');
console.log('  Depois de usar, APAGUE esse arquivo (ele contém a senha e a chave).');
console.log(`  Na tela Configuração Fiscal, a empresa deve ter o prefixo: ${prefix}`);
