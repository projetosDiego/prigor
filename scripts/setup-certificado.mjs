#!/usr/bin/env node
/**
 * Configura o certificado digital A1 sem precisar editar o .env à mão.
 *
 *   npm run cert:setup
 *
 * 1. Procura o .pfx em C:\projetos\PRIGOR\certificado\ (ou caminho passado como argumento).
 * 2. Pede a senha (digitação oculta) e confere se ela abre o certificado.
 * 3. Certificado em formato antigo (RC2-40, comum nas certificadoras brasileiras)
 *    não abre no Node 22 / OpenSSL 3. Nesse caso o script gera uma cópia em
 *    formato moderno (AES-256), na mesma pasta, e passa a usar a cópia.
 *    O arquivo original não é alterado.
 * 4. Grava SICOOB_CERT_PATH e SICOOB_CERT_PASSWORD no .env e mostra titular e validade.
 *    A senha nunca é exibida.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const defaultDir = path.resolve(root, '..', 'certificado');
const MODERN_SUFFIX = '-moderno.pfx';

function findPfx() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  if (!fs.existsSync(defaultDir)) return null;
  const files = fs
    .readdirSync(defaultDir)
    .filter((f) => /\.(pfx|p12)$/i.test(f) && !f.endsWith(MODERN_SUFFIX));
  if (files.length > 1) {
    console.error(`Há mais de um certificado em ${defaultDir}: ${files.join(', ')}`);
    console.error('Deixe só o atual na pasta ou rode: npm run cert:setup -- "<caminho do arquivo>"');
    process.exit(1);
  }
  return files[0] ? path.join(defaultDir, files[0]) : null;
}

/** Lê a senha sem mostrar na tela. Aceita digitar ou colar (Ctrl+V / botão direito). */
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
      resolve(value);
    };
    const onData = (chunk) => {
      // Colar chega como um bloco só: trata caractere por caractere.
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
        if (ch === '\u001b') continue; // teclas especiais
        value += ch;
        if (isTTY) process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Valor literal para o .env. O dotenv NÃO desfaz escapes (\\ fica \\), então
 * nada de JSON.stringify: aspas simples guardam o valor exatamente como é.
 */
function envQuote(value) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"') && !value.includes('\\')) return `"${value}"`;
  throw new Error('A senha tem aspas simples e duplas ao mesmo tempo; grave-a manualmente no .env.');
}

function upsertEnv(vars) {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, val] of Object.entries(vars)) {
    const line = `${key}=${envQuote(val)}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/(\r?\n)*$/, nl)}${line}${nl}`;
  }
  fs.writeFileSync(envPath, text);
}

/** Abre o PFX como o sistema vai abrir (TLS do Node) e devolve o certificado do titular. */
function openWithNode(pfxBuf, passphrase) {
  const ctx = tls.createSecureContext({ pfx: pfxBuf, passphrase });
  const socket = new tls.TLSSocket(null, { secureContext: ctx });
  const der = socket.getCertificate()?.raw;
  socket.destroy();
  if (!der) throw new Error('Certificado sem conteúdo.');
  return new crypto.X509Certificate(der);
}

const isWrongPassword = (err) => /mac verify|invalid password|bad decrypt/i.test(String(err?.message ?? err));
const isLegacyFormat = (err) =>
  err?.code === 'ERR_OSSL_EVP_UNSUPPORTED' || /unsupported|legacy/i.test(String(err?.message ?? err));

/**
 * Formato antigo: abre com node-forge (JS puro, entende RC2/3DES) e regrava em AES-256.
 * Lança Error('SENHA') se a senha não abrir o arquivo.
 */
async function convertLegacy(pfxBuf, password, targetPath) {
  let forge;
  try {
    forge = (await import('node-forge')).default;
  } catch {
    console.error('\nEste certificado está num formato antigo e precisa de uma ferramenta extra para converter.');
    console.error('Rode uma vez:   npm install');
    console.error('e depois de novo:   npm run cert:setup');
    process.exit(1);
  }
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuf.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (err) {
    if (/mac could not be verified|invalid password/i.test(String(err?.message))) throw new Error('SENHA');
    throw err;
  }
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert);
  if (!keyBag?.key || certs.length === 0) throw new Error('Não encontrei a chave ou o certificado dentro do arquivo.');

  // Titular primeiro: o certificado cuja chave pública bate com a chave privada.
  const pub = forge.pki.setRsaPublicKey(keyBag.key.n, keyBag.key.e);
  const pubPem = forge.pki.publicKeyToPem(pub);
  certs.sort((a, b) => Number(forge.pki.publicKeyToPem(b.publicKey) === pubPem) - Number(forge.pki.publicKeyToPem(a.publicKey) === pubPem));

  const modern = forge.pkcs12.toPkcs12Asn1(keyBag.key, certs, password, { algorithm: 'aes256', generateLocalKeyId: true });
  const out = Buffer.from(forge.asn1.toDer(modern).getBytes(), 'binary');
  fs.writeFileSync(targetPath, out);
  return out;
}

// ─── Execução ───────────────────────────────────────────────────────────────

const pfxPath = findPfx();
if (!pfxPath || !fs.existsSync(pfxPath)) {
  console.error(`Nenhum certificado .pfx encontrado em ${defaultDir}`);
  console.error('Coloque o arquivo nessa pasta e rode de novo: npm run cert:setup');
  process.exit(1);
}
console.log(`Certificado encontrado: ${path.basename(pfxPath)}`);
const original = fs.readFileSync(pfxPath);

let cert = null;
let usedPath = pfxPath;
let password = '';

for (let attempt = 1; attempt <= 3 && !cert; attempt++) {
  password = await askHidden('Senha do certificado: ');
  try {
    cert = openWithNode(original, password);
  } catch (err) {
    if (isWrongPassword(err)) {
      console.error(attempt < 3 ? 'Senha incorreta. Tente de novo.' : 'Senha incorreta 3 vezes. Nada foi alterado.');
      continue;
    }
    if (!isLegacyFormat(err)) {
      console.error(`Não consegui abrir o certificado: ${err.message}`);
      process.exit(1);
    }
    // Formato antigo → converte uma cópia.
    const target = pfxPath.replace(/\.(pfx|p12)$/i, MODERN_SUFFIX);
    try {
      const modern = await convertLegacy(original, password, target);
      cert = openWithNode(modern, password);
      usedPath = target;
      console.log('Certificado em formato antigo: criei uma cópia moderna ao lado do original.');
    } catch (convErr) {
      if (convErr.message === 'SENHA') {
        console.error(attempt < 3 ? 'Senha incorreta. Tente de novo.' : 'Senha incorreta 3 vezes. Nada foi alterado.');
        continue;
      }
      console.error(`Não consegui converter o certificado: ${convErr.message}`);
      process.exit(1);
    }
  }
}
if (!cert) process.exit(1);

// Barra normal funciona no Windows e evita problema de escape no .env.
upsertEnv({ SICOOB_CERT_PATH: usedPath.replace(/\\/g, '/'), SICOOB_CERT_PASSWORD: password });

// Parte pública, para anexar no portal Sicoob (passo "Segurança").
const publicPem = path.join(path.dirname(pfxPath), 'certificado-publico.pem');
fs.writeFileSync(publicPem, cert.toString());

const validTo = new Date(cert.validTo);
const days = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
const cn = (s) => s.split('\n').find((l) => l.startsWith('CN=')) ?? s;
console.log('\n✔ Certificado configurado no .env');
console.log(`  Titular:  ${cn(cert.subject)}`);
console.log(`  Emissor:  ${cn(cert.issuer)}`);
console.log(`  Validade: ${validTo.toLocaleDateString('pt-BR')} (${days} dias)`);
console.log(`  Arquivo para o portal Sicoob: ${publicPem}`);
if (days < 30) console.warn('  ⚠ Vence em menos de 30 dias — providencie a renovação.');
