/**
 * Configuração das integrações de faturamento (Sicoob e provedor fiscal).
 *
 * Separado de `src/server/env.ts` de propósito: aquele módulo roda também no
 * edge (proxy) e derruba o boot se algo faltar. Aqui tudo é opcional — sem
 * credencial, a integração fica "não configurada" e o resto do ERP segue
 * funcionando normalmente. Lido só no servidor (Node).
 *
 * Segredos (senha do certificado, tokens) NUNCA saem deste módulo:
 * `integrationStatus()` devolve só "configurado sim/não" para a tela.
 */
import fs from 'node:fs';

import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? '').toLowerCase() === 'true');

const schema = z.object({
  // ─── Sicoob ────────────────────────────────────────────────────────────
  SICOOB_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SICOOB_CLIENT_ID: z.string().trim().default(''),
  SICOOB_CERT_PATH: z.string().trim().default(''),
  /** Alternativa ao arquivo (servidor/Docker): o .pfx inteiro em base64. */
  SICOOB_CERT_BASE64: z.string().default('').transform((v) => v.replace(/\s+/g, '')),
  SICOOB_CERT_PASSWORD: z.string().default(''),
  /** Token fixo fornecido no menu "Sandbox" do portal (só no ambiente de testes). */
  SICOOB_SANDBOX_TOKEN: z.string().trim().default(''),
  SICOOB_NUMERO_CLIENTE: z.string().trim().default(''),
  SICOOB_CONTA_CORRENTE: z.string().trim().default(''),
  SICOOB_MODALIDADE: z.coerce.number().int().positive().default(1),
  /** Boleto híbrido (QR Code Pix). Só ligar se o Sicoob habilitar Pix no convênio. */
  SICOOB_BOLETO_PIX: bool,

  // ─── Provedor fiscal (NF-e) ───────────────────────────────────────────
  FISCAL_PROVIDER: z.enum(['', 'notaas', 'focus', 'nuvemfiscal', 'plugnotas']).default(''),
  FISCAL_API_TOKEN: z.string().trim().default(''),
  FISCAL_ENV: z.enum(['homologacao', 'producao']).default('homologacao'),
  FISCAL_WEBHOOK_SECRET: z.string().trim().default(''),

  /** Liga a emissão de BOLETOS. Desligado = nada vai ao Sicoob. (NF é controlada por FISCAL_ENV.) */
  BILLING_ENABLED: bool,
});

export type IntegrationEnv = z.infer<typeof schema>;

/**
 * Várias empresas (CNPJs) emitindo pelo mesmo sistema.
 *
 * A empresa principal usa as variáveis de sempre (SICOOB_CLIENT_ID, …).
 * As demais usam o mesmo nome com prefixo: EMPRESA_<PREFIXO>_SICOOB_CLIENT_ID.
 * Credenciais (certificado, senha, client id, conta, token do provedor) NUNCA
 * caem para as da principal; só ajustes gerais (ambientes, provedor, liga/desliga)
 * são compartilhados quando a empresa não define os seus.
 */
const SHARED_KEYS = new Set<string>([
  'SICOOB_ENV',
  'SICOOB_MODALIDADE',
  'SICOOB_BOLETO_PIX',
  'FISCAL_PROVIDER',
  'FISCAL_ENV',
  'FISCAL_WEBHOOK_SECRET',
  'BILLING_ENABLED',
]);

/** Prefixo normalizado ('' = empresa principal). */
export function normalizeScope(scope?: string | null): string {
  return (scope ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function scopedVarName(scope: string, key: string): string {
  const s = normalizeScope(scope);
  return s ? `EMPRESA_${s}_${key}` : key;
}

function sourceFor(scope: string): Record<string, string | undefined> {
  if (!scope) return process.env;
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) {
    const own = process.env[scopedVarName(scope, key)];
    out[key] = own !== undefined && own !== '' ? own : SHARED_KEYS.has(key) ? process.env[key] : undefined;
  }
  return out;
}

const cache = new Map<string, IntegrationEnv>();

export function integrationEnv(scope?: string | null): IntegrationEnv {
  const key = normalizeScope(scope);
  let env = cache.get(key);
  if (!env) {
    const parsed = schema.safeParse(sourceFor(key));
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Configuração de integração inválida${key ? ` (empresa ${key})` : ''}: ${problems}`);
    }
    env = parsed.data;
    cache.set(key, env);
  }
  return env;
}

/** Só para testes: força reler o ambiente. */
export function resetIntegrationEnvCache(): void {
  cache.clear();
}

export interface IntegrationStatus {
  billingEnabled: boolean;
  sicoob: {
    environment: 'sandbox' | 'production';
    clientId: boolean;
    certificate: boolean;
    sandboxToken: boolean;
    account: boolean;
    ready: boolean;
    missing: string[];
  };
  fiscal: {
    provider: string | null;
    environment: 'homologacao' | 'producao';
    token: boolean;
    ready: boolean;
    missing: string[];
  };
}

function fileExists(path: string): boolean {
  if (!path) return false;
  try {
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
}

/** O que está configurado — sem expor valor nenhum. */
export function integrationStatus(scope?: string | null): IntegrationStatus {
  const e = integrationEnv(scope);

  const certificate =
    (e.SICOOB_CERT_BASE64.length > 0 || fileExists(e.SICOOB_CERT_PATH)) && e.SICOOB_CERT_PASSWORD.length > 0;
  const account = Boolean(e.SICOOB_NUMERO_CLIENTE && e.SICOOB_CONTA_CORRENTE);
  const sicoobMissing: string[] = [];
  if (!e.SICOOB_CLIENT_ID) sicoobMissing.push('Client ID do aplicativo Sicoob');
  if (e.SICOOB_ENV === 'production' && !certificate) sicoobMissing.push('Certificado digital A1 (npm run cert:setup)');
  if (e.SICOOB_ENV === 'sandbox' && !e.SICOOB_SANDBOX_TOKEN) sicoobMissing.push('Token do sandbox Sicoob');
  if (!account) sicoobMissing.push('Número do cliente e conta corrente (convênio de cobrança)');

  const fiscalMissing: string[] = [];
  if (!e.FISCAL_PROVIDER) fiscalMissing.push('Provedor fiscal escolhido');
  if (!e.FISCAL_API_TOKEN) fiscalMissing.push('Token da API do provedor fiscal');

  return {
    billingEnabled: e.BILLING_ENABLED,
    sicoob: {
      environment: e.SICOOB_ENV,
      clientId: Boolean(e.SICOOB_CLIENT_ID),
      certificate,
      sandboxToken: Boolean(e.SICOOB_SANDBOX_TOKEN),
      account,
      ready: sicoobMissing.length === 0,
      missing: sicoobMissing,
    },
    fiscal: {
      provider: e.FISCAL_PROVIDER || null,
      environment: e.FISCAL_ENV,
      token: Boolean(e.FISCAL_API_TOKEN),
      ready: fiscalMissing.length === 0,
      missing: fiscalMissing,
    },
  };
}
