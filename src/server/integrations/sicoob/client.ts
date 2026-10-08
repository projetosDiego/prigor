/**
 * Cliente da API do Sicoob (Cobrança Bancária v3).
 *
 *  - Produção: OAuth2 `client_credentials` + mTLS com o certificado A1.
 *    O token é guardado em memória até perto de expirar.
 *  - Sandbox: token fixo do portal (menu "Sandbox"), sem certificado.
 *
 * As URLs abaixo seguem a documentação do portal developers.sicoob.com.br —
 * CONFERIR no portal antes de ligar a produção (fase 6).
 *
 * Este módulo só transporta: não sabe nada de pedido. Regras ficam em
 * `domain/billing.ts`; orquestração, em `services/boletos.ts` (fase 2).
 */
import fs from 'node:fs';

import { integrationEnv, normalizeScope } from '../config';
import { httpRequest, IntegrationHttpError, type HttpResponse } from '../http';

const URLS = {
  production: {
    token: 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token',
    cobranca: 'https://api.sicoob.com.br/cobranca-bancaria/v3',
  },
  sandbox: {
    token: null,
    cobranca: 'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  },
} as const;

/** Escopos pedidos no token: incluir/consultar/alterar boletos e gerenciar webhook. */
export const SICOOB_SCOPES = [
  'boletos_inclusao',
  'boletos_consulta',
  'boletos_alteracao',
  'webhooks_inclusao',
  'webhooks_consulta',
  'webhooks_alteracao',
].join(' ');

export class SicoobNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Integração Sicoob não configurada: falta ${missing.join(', ')}.`);
    this.name = 'SicoobNotConfiguredError';
  }
}

export class SicoobApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'SicoobApiError';
  }
}

// Caches por empresa (prefixo da configuração; '' = principal).
const tokenCache = new Map<string, { value: string; expiresAt: number }>();
const pfxCache = new Map<string, { key: string; buffer: Buffer }>();

/**
 * Certificado A1: em base64 (SICOOB_CERT_BASE64, usado no servidor) ou
 * arquivo .pfx (SICOOB_CERT_PATH, usado no computador local).
 */
function certificate(scope = ''): { pfx: Buffer; passphrase: string } {
  const e = integrationEnv(scope);
  const source = e.SICOOB_CERT_BASE64 ? 'base64' : e.SICOOB_CERT_PATH;
  if (!source || !e.SICOOB_CERT_PASSWORD) {
    throw new SicoobNotConfiguredError(['certificado digital A1 (rode: npm run cert:setup)']);
  }
  const key = source === 'base64' ? `b64:${e.SICOOB_CERT_BASE64.length}` : `file:${source}`;
  const cached = pfxCache.get(scope);
  if (cached && cached.key === key) return { pfx: cached.buffer, passphrase: e.SICOOB_CERT_PASSWORD };
  const buffer = source === 'base64' ? Buffer.from(e.SICOOB_CERT_BASE64, 'base64') : fs.readFileSync(e.SICOOB_CERT_PATH);
  pfxCache.set(scope, { key, buffer });
  return { pfx: buffer, passphrase: e.SICOOB_CERT_PASSWORD };
}

async function accessToken(scope = ''): Promise<string> {
  const e = integrationEnv(scope);
  if (!e.SICOOB_CLIENT_ID) throw new SicoobNotConfiguredError(['Client ID (SICOOB_CLIENT_ID)']);

  if (e.SICOOB_ENV === 'sandbox') {
    if (!e.SICOOB_SANDBOX_TOKEN) throw new SicoobNotConfiguredError(['token do sandbox (SICOOB_SANDBOX_TOKEN)']);
    return e.SICOOB_SANDBOX_TOKEN;
  }

  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const { pfx, passphrase } = certificate(scope);
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: e.SICOOB_CLIENT_ID,
    scope: SICOOB_SCOPES,
  }).toString();

  const res = await httpRequest<{ access_token?: string; expires_in?: number }>({
    method: 'POST',
    url: URLS.production.token,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    pfx,
    passphrase,
  });

  if (res.status !== 200 || !res.body?.access_token) {
    throw new SicoobApiError('Sicoob recusou a autenticação (token).', res.status, res.body);
  }

  tokenCache.set(scope, {
    value: res.body.access_token,
    expiresAt: Date.now() + (res.body.expires_in ?? 300) * 1000,
  });
  return res.body.access_token;
}

/**
 * Chamada autenticada à API de Cobrança. `path` relativo, ex.: `/boletos`.
 * Lança `SicoobApiError` para qualquer status fora de 2xx.
 */
export async function sicoobCobranca<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  scopeArg?: string | null,
): Promise<HttpResponse<T>> {
  const scope = normalizeScope(scopeArg);
  const e = integrationEnv(scope);
  const base = URLS[e.SICOOB_ENV].cobranca;
  const token = await accessToken(scope);
  const tls = e.SICOOB_ENV === 'production' ? certificate(scope) : {};

  let res: HttpResponse<T>;
  try {
    res = await httpRequest<T>({
      method,
      url: `${base}${path}`,
      headers: { Authorization: `Bearer ${token}`, client_id: e.SICOOB_CLIENT_ID },
      body,
      ...tls,
    });
  } catch (err) {
    if (err instanceof IntegrationHttpError) throw new SicoobApiError(err.message, 0, null);
    throw err;
  }

  if (res.status === 401) tokenCache.delete(scope); // força renovar na próxima
  if (res.status < 200 || res.status >= 300) {
    throw new SicoobApiError(`Sicoob respondeu ${res.status} em ${method} ${path}.`, res.status, res.body);
  }
  return res;
}

/** Dados fixos do beneficiário usados em toda chamada de boleto. */
export function sicoobAccount(
  scope?: string | null,
): { numeroCliente: number; codigoModalidade: number; numeroContaCorrente: number; pix: boolean } {
  const e = integrationEnv(scope);
  if (!e.SICOOB_NUMERO_CLIENTE || !e.SICOOB_CONTA_CORRENTE) {
    throw new SicoobNotConfiguredError(['número do cliente/conta corrente do convênio']);
  }
  return {
    numeroCliente: Number(e.SICOOB_NUMERO_CLIENTE.replace(/\D/g, '')),
    codigoModalidade: e.SICOOB_MODALIDADE,
    numeroContaCorrente: Number(e.SICOOB_CONTA_CORRENTE.replace(/\D/g, '')),
    pix: e.SICOOB_BOLETO_PIX,
  };
}
