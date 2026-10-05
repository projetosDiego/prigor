#!/usr/bin/env node
/**
 * Testa a conexão com o Sicoob SEM mexer em nada: só pede um token de acesso
 * (OAuth2 + certificado) e mostra se deu certo e quais permissões vieram.
 * Não emite boleto, não consulta conta, não mostra o token.
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

const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const SCOPES = 'boletos_inclusao boletos_consulta boletos_alteracao webhooks_inclusao webhooks_consulta webhooks_alteracao';

const { SICOOB_CLIENT_ID: clientId, SICOOB_CERT_PATH: certPath, SICOOB_CERT_PASSWORD: certPass } = process.env;
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
