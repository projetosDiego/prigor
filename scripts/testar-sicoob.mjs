#!/usr/bin/env node
/**
 * Testa a conexão com o Sicoob SEM mexer em nada: pede um token de acesso
 * (OAuth2 + certificado) e mostra se deu certo e quais permissões vieram.
 * Se SICOOB_NUMERO_CLIENTE estiver no .env, confere o contrato de cobrança
 * com uma CONSULTA (faixas de nosso número). Não emite boleto, não mostra o token.
 *
 *   npm run sicoob:testar
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  console.error('Não achei o arquivo .env na pasta do projeto.');
  process.exit(1);
}

// ─── Outra empresa (CNPJ) sem mexer no .env: npm run sicoob:testar -- --empresa <cód. beneficiário>
if (process.argv.includes('--empresa')) {
  const { createInterface } = await import('node:readline/promises');
  const ask = async (q) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = (await rl.question(q)).trim();
    rl.close();
    return a;
  };
  const askHidden = (q) =>
    new Promise((resolve) => {
      const stdin = process.stdin;
      process.stdout.write(q);
      let value = '';
      const tty = Boolean(stdin.isTTY);
      if (tty) stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      const onData = (chunk) => {
        for (const ch of chunk) {
          if (ch === '\r' || ch === '\n' || ch === '\u0004') {
            if (tty) stdin.setRawMode(false);
            stdin.pause();
            stdin.off('data', onData);
            process.stdout.write('\n');
            return resolve(value);
          }
          if (ch === '\u0003') process.exit(130);
          if (ch === '\u0008' || ch === '\u007f') { value = value.slice(0, -1); continue; }
          if (ch === '\u001b') continue;
          value += ch;
          if (tty) process.stdout.write('*');
        }
      };
      stdin.on('data', onData);
    });
  const certDir = path.resolve(root, '..', 'certificado');
  const files = fs.readdirSync(certDir).filter((f) => f.endsWith('-moderno.pfx'));
  console.log('Certificados:');
  files.forEach((f, i) => console.log(`  ${i + 1}) ${f}`));
  const n = Number(await ask('Número do certificado desta empresa: ')) - 1;
  if (!files[n]) { console.error('Opção inválida.'); process.exit(1); }
  process.env.SICOOB_CERT_PATH = path.join(certDir, files[n]);
  process.env.SICOOB_CLIENT_ID = await ask('Client ID do aplicativo Sicoob desta empresa: ');
  process.env.SICOOB_CERT_PASSWORD = await askHidden('Senha do certificado (não aparece): ');
  process.env.SICOOB_NUMERO_CLIENTE = '';
}

const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const SCOPES = 'boletos_inclusao boletos_consulta boletos_alteracao webhooks_inclusao webhooks_consulta webhooks_alteracao';

const { SICOOB_CLIENT_ID: clientId, SICOOB_CERT_PATH: certPath, SICOOB_CERT_PASSWORD: certPass } = process.env;
const numeroCliente = (process.env.SICOOB_NUMERO_CLIENTE ?? '').trim();
const modalidade = Number(process.env.SICOOB_MODALIDADE || 1);
const API_URL = 'https://api.sicoob.com.br/cobranca-bancaria/v3';
const missing = [];
if (!clientId) missing.push('SICOOB_CLIENT_ID');
if (!certPath) missing.push('SICOOB_CERT_PATH (rode npm run cert:setup)');
if (!certPass) missing.push('SICOOB_CERT_PASSWORD (rode npm run cert:setup)');
if (missing.length) {
  console.error(`Falta no .env: ${missing.join(', ')}`);
  process.exit(1);
}
if (!fs.existsSync(certPath)) {
  console.error(`Certificado não encontrado em: ${certPath}`);
  process.exit(1);
}

const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope: SCOPES }).toString();
const url = new URL(TOKEN_URL);

console.log('Pedindo token ao Sicoob...');
const req = https.request(
  {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    pfx: fs.readFileSync(certPath),
    passphrase: certPass,
    timeout: 20_000,
  },
  (res) => {
    let raw = '';
    res.on('data', (c) => (raw += c));
    res.on('end', () => {
      let json = {};
      try { json = JSON.parse(raw); } catch { /* resposta não-JSON */ }
      if (res.statusCode === 200 && json.access_token) {
        console.log('\n✔ Conexão com o Sicoob funcionando!');
        console.log(`  Token válido por ${Math.round((json.expires_in ?? 0) / 60)} min`);
        console.log(`  Permissões: ${json.scope ?? '(não informadas)'}`);
        if (numeroCliente || process.argv.slice(2).some((a) => /^\d+$/.test(a))) checkContract(json.access_token);
        else console.log('\n(Sem SICOOB_NUMERO_CLIENTE no .env: contrato de cobrança não conferido.)');
        return;
      }
      console.error(`\n✖ O Sicoob recusou (HTTP ${res.statusCode}).`);
      console.error(`  ${json.error_description ?? json.error ?? raw.slice(0, 300)}`);
      if (res.statusCode === 401 || /unauthorized_client|invalid_client/i.test(raw)) {
        console.error('  Causa provável: aplicativo ainda pendente de aprovação no Sicoobnet, ou certificado diferente do enviado no portal.');
      }
      process.exit(1);
    });
  },
);
req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
req.on('error', (err) => {
  console.error(`\n✖ Não consegui conectar: ${err.message}`);
  if (/unsupported|mac verify/i.test(err.message)) console.error('  Rode de novo: npm run cert:setup');
  process.exit(1);
});
req.write(body);
req.end();

/**
 * Diagnóstico só-leitura do contrato de cobrança. Para cada número candidato
 * testa as modalidades 1 a 9 em duas consultas (faixas de nosso número e
 * consulta de boleto). Resposta diferente de "contrato não encontrado" = o
 * contrato existe naquela combinação.
 *   npm run sicoob:testar               (usa o número do .env)
 *   npm run sicoob:testar -- 1301813    (testa o número informado)
 */
function checkContract(token) {
  const args = process.argv.slice(2).map((a) => a.replace(/\D/g, '')).filter(Boolean);
  const numbers = [...new Set(args.length ? args : [numeroCliente.replace(/\D/g, '')])];
  const modalidades = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const jobs = [];
  for (const n of numbers) {
    for (const m of modalidades) {
      jobs.push({ n, m, kind: 'faixas', path: `/boletos/faixas-nosso-numero?${new URLSearchParams({ numeroCliente: n, codigoModalidade: String(m), quantidade: '1' })}` });
      jobs.push({ n, m, kind: 'consulta', path: `/boletos?${new URLSearchParams({ numeroCliente: n, codigoModalidade: String(m), nossoNumero: '1' })}` });
    }
  }
  const found = [];
  const run = (i) => {
    if (i >= jobs.length) {
      if (found.length) {
        console.log(`\n>>> Contrato reconhecido em: ${found.join(' | ')}`);
      } else {
        console.error('\n✖ Nenhuma combinação foi aceita. O contrato não está habilitado para a API — falar com o gerente.');
        process.exitCode = 1;
      }
      return;
    }
    const j = jobs[i];
    const u = new URL(API_URL + j.path);
    const r = https.request(
      {
        method: 'GET', hostname: u.hostname, path: u.pathname + u.search,
        headers: { Authorization: `Bearer ${token}`, client_id: clientId, Accept: 'application/json' },
        pfx: fs.readFileSync(certPath), passphrase: certPass, timeout: 20_000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let msg = raw.replace(/\s+/g, ' ').slice(0, 160);
          try { const js = JSON.parse(raw); msg = (js.mensagens ?? []).map((x) => `${x.codigo ?? ''} ${x.mensagem ?? ''}`.trim()).join('; ') || msg; } catch { /* ok */ }
          const contratoInvalido = /5002|contrato n[aã]o encontrado/i.test(msg);
          const ok = res.statusCode < 300 || !contratoInvalido;
          if (ok) found.push(`número ${j.n}, modalidade ${j.m} (${j.kind})`);
          console.log(`${ok ? '✔' : '·'} ${j.n} mod ${j.m} ${j.kind.padEnd(8)} HTTP ${res.statusCode} ${msg}`);
          run(i + 1);
        });
      },
    );
    r.on('timeout', () => r.destroy(new Error('tempo esgotado')));
    r.on('error', (err) => { console.log(`· ${j.n} mod ${j.m} ${j.kind} erro: ${err.message}`); run(i + 1); });
    r.end();
  };
  console.log(`\nDiagnóstico do contrato (só consultas, nada é emitido):`);
  run(0);
}
