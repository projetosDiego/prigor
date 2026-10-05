#!/usr/bin/env node
/**
 * Grava a chave da API de nota fiscal (Notaas) no .env sem editar o arquivo à mão.
 *
 *   npm run fiscal:setup
 *
 * Pede a chave (oculta), confere o formato, testa se a Notaas aceita a chave
 * (sem emitir nada) e grava FISCAL_PROVIDER, FISCAL_API_TOKEN e FISCAL_ENV.
 * O ambiente começa SEMPRE em homologação (teste, sem valor fiscal).
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

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
          if (value.length) { value = value.slice(0, -1); if (isTTY) process.stdout.write('\b \b'); }
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

function upsertEnv(vars) {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, val] of Object.entries(vars)) {
    const line = `${key}='${val}'`;
    const re = new RegExp(`^${key}=.*?(\\r?)$`, 'm');
    text = re.test(text) ? text.replace(re, `${line}$1`) : `${text.replace(/(\r?\n)*$/, nl)}${line}${nl}`;
  }
  fs.writeFileSync(envPath, text);
}

/** Chamada que só lê (status de uma nota inexistente): 401/403 = chave recusada; 404 = chave aceita. */
function checkKey(key) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        method: 'GET',
        hostname: 'platform.notaas.com.br',
        path: '/api/v1/nfe/invoices/00000000-0000-0000-0000-000000000000/status',
        headers: { 'x-api-key': key, Accept: 'application/json' },
        timeout: 15_000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(0));
    req.end();
  });
}

const key = await askHidden('Cole a chave da API da Notaas (começa com ntaas_): ');
if (!/^ntaas_[A-Za-z0-9_-]{16,}$/.test(key)) {
  console.error('Isso não parece uma chave da Notaas. Ela começa com "ntaas_" e é longa.');
  console.error('Gere em: painel da Notaas › API Keys.');
  process.exit(1);
}

process.stdout.write('Conferindo a chave com a Notaas... ');
const status = await checkKey(key);
if (status === 401 || status === 403) {
  console.log('recusada.');
  console.error('A Notaas não aceitou essa chave. Gere uma nova no painel e tente de novo.');
  process.exit(1);
}
console.log(status === 0 ? 'sem resposta (sem internet?) — gravando assim mesmo.' : 'ok.');

upsertEnv({ FISCAL_PROVIDER: 'notaas', FISCAL_API_TOKEN: key, FISCAL_ENV: 'homologacao' });
console.log('\n✔ Chave da Notaas gravada no .env (ambiente: homologação/teste).');
