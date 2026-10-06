#!/usr/bin/env node
/**
 * Gera, num arquivo de texto, o comando pronto para colar no terminal da VPS
 * que liga o boleto Sicoob no servidor (certificado em base64 + senha + dados
 * da conta). NÃO mostra nenhum segredo na tela.
 *
 *   npm run sicoob:comando-vps
 *
 * O arquivo sai em ../certificado/COMANDO-VPS-SICOOB.txt (fora do git).
 * Apague o arquivo depois de usar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  console.error('Não achei o arquivo .env na pasta do projeto.');
  process.exit(1);
}

const e = process.env;
const need = ['SICOOB_CERT_PATH', 'SICOOB_CERT_PASSWORD', 'SICOOB_CLIENT_ID', 'SICOOB_CONTA_CORRENTE', 'SICOOB_NUMERO_CLIENTE'];
const missing = need.filter((k) => !(e[k] ?? '').trim());
if (missing.length) {
  console.error(`Falta no .env: ${missing.join(', ')}`);
  process.exit(1);
}
if (!fs.existsSync(e.SICOOB_CERT_PATH)) {
  console.error(`Certificado não encontrado em: ${e.SICOOB_CERT_PATH}`);
  process.exit(1);
}
const values = {
  SICOOB_ENV: 'production',
  SICOOB_CLIENT_ID: e.SICOOB_CLIENT_ID.trim(),
  SICOOB_CONTA_CORRENTE: e.SICOOB_CONTA_CORRENTE.trim(),
  SICOOB_NUMERO_CLIENTE: e.SICOOB_NUMERO_CLIENTE.trim(),
  SICOOB_MODALIDADE: (e.SICOOB_MODALIDADE || '1').trim(),
  SICOOB_CERT_PASSWORD: e.SICOOB_CERT_PASSWORD,
  SICOOB_CERT_BASE64: fs.readFileSync(e.SICOOB_CERT_PATH).toString('base64'),
  BILLING_ENABLED: 'true',
};
for (const [k, v] of Object.entries(values)) {
  if (v.includes("'") || /[\r\n]/.test(v)) {
    console.error(`${k} tem um caractere que não dá para gravar no .env (aspas simples ou quebra de linha).`);
    process.exit(1);
  }
}
const block = '\n' + Object.entries(values).map(([k, v]) => `${k}='${v}'`).join('\n') + '\n';
const b64 = Buffer.from(block, 'utf8').toString('base64');

const command =
  `cd /opt/prigor && cp .env .env.bak.$(date +%s) && sed -i '/^SICOOB_/d;/^BILLING_ENABLED=/d' .env` +
  ` && echo '${b64}' | base64 -d >> .env` +
  ` && docker compose -f docker-compose.prod.yml --env-file .env up -d` +
  ` && history -c && echo 'SICOOB CONFIGURADO NO SERVIDOR'`;

const outDir = path.resolve(root, '..', 'certificado');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'COMANDO-VPS-SICOOB.txt');
fs.writeFileSync(out, command + '\n');
console.log(`✔ Comando gerado em: ${out}`);
console.log('  Abra no Bloco de Notas, Ctrl+A, Ctrl+C e cole no terminal da VPS.');
console.log('  Depois de usar, APAGUE esse arquivo (ele contém a senha do certificado).');
