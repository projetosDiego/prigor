import { afterEach, describe, expect, it, vi } from 'vitest';

import { integrationStatus, resetIntegrationEnvCache } from '@/server/integrations/config';

const KEYS = [
  'SICOOB_ENV', 'SICOOB_CLIENT_ID', 'SICOOB_CERT_PATH', 'SICOOB_CERT_BASE64', 'SICOOB_CERT_PASSWORD', 'SICOOB_SANDBOX_TOKEN',
  'SICOOB_NUMERO_CLIENTE', 'SICOOB_CONTA_CORRENTE', 'FISCAL_PROVIDER', 'FISCAL_API_TOKEN', 'BILLING_ENABLED',
];

function withEnv(values: Record<string, string>) {
  for (const k of KEYS) vi.stubEnv(k, values[k] ?? '');
  resetIntegrationEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetIntegrationEnvCache();
});

describe('integrationStatus', () => {
  it('sem nada configurado: tudo pendente, ERP segue funcionando', () => {
    withEnv({ SICOOB_ENV: 'sandbox' });
    const s = integrationStatus();
    expect(s.billingEnabled).toBe(false);
    expect(s.sicoob.ready).toBe(false);
    expect(s.sicoob.missing.length).toBeGreaterThan(0);
    expect(s.fiscal.ready).toBe(false);
  });

  it('sandbox pronto com client id, token de teste e conta', () => {
    withEnv({
      SICOOB_ENV: 'sandbox',
      SICOOB_CLIENT_ID: 'abc',
      SICOOB_SANDBOX_TOKEN: 'tok',
      SICOOB_NUMERO_CLIENTE: '123',
      SICOOB_CONTA_CORRENTE: '456',
    });
    expect(integrationStatus().sicoob).toMatchObject({ ready: true, missing: [] });
  });

  it('produção exige certificado existente', () => {
    withEnv({
      SICOOB_ENV: 'production',
      SICOOB_CLIENT_ID: 'abc',
      SICOOB_CERT_PATH: '/caminho/que/nao/existe.pfx',
      SICOOB_CERT_PASSWORD: 'x',
      SICOOB_NUMERO_CLIENTE: '123',
      SICOOB_CONTA_CORRENTE: '456',
    });
    const s = integrationStatus().sicoob;
    expect(s.ready).toBe(false);
    expect(s.certificate).toBe(false);
    expect(s.missing.join(' ')).toMatch(/Certificado/);
  });

  it('produção aceita certificado em base64 (servidor) sem arquivo', () => {
    withEnv({
      SICOOB_ENV: 'production',
      SICOOB_CLIENT_ID: 'abc',
      SICOOB_CERT_BASE64: 'TUlJRW9n\nQUlCQURB',
      SICOOB_CERT_PASSWORD: 'x',
      SICOOB_NUMERO_CLIENTE: '123',
      SICOOB_CONTA_CORRENTE: '456',
    });
    const s = integrationStatus().sicoob;
    expect(s.certificate).toBe(true);
    expect(s.ready).toBe(true);
    expect(JSON.stringify(integrationStatus())).not.toContain('TUlJRW9n');
  });

  it('não expõe segredo nenhum', () => {
    withEnv({ SICOOB_ENV: 'sandbox', SICOOB_CERT_PASSWORD: 'senha-secreta', SICOOB_SANDBOX_TOKEN: 'token-secreto' });
    const json = JSON.stringify(integrationStatus());
    expect(json).not.toContain('senha-secreta');
    expect(json).not.toContain('token-secreto');
  });
});

describe('várias empresas (prefixo EMPRESA_<X>_)', () => {
  const SCOPED = [
    'EMPRESA_PRISCILLA_SICOOB_CLIENT_ID', 'EMPRESA_PRISCILLA_SICOOB_CERT_BASE64', 'EMPRESA_PRISCILLA_SICOOB_CERT_PASSWORD',
    'EMPRESA_PRISCILLA_SICOOB_NUMERO_CLIENTE', 'EMPRESA_PRISCILLA_SICOOB_CONTA_CORRENTE', 'EMPRESA_PRISCILLA_FISCAL_API_TOKEN',
  ];
  const principal = {
    SICOOB_ENV: 'production', SICOOB_CLIENT_ID: 'igor', SICOOB_CERT_BASE64: 'QUJD', SICOOB_CERT_PASSWORD: 'x',
    SICOOB_NUMERO_CLIENTE: '1586513', SICOOB_CONTA_CORRENTE: '37228-5', FISCAL_PROVIDER: 'notaas',
    FISCAL_API_TOKEN: 'ntaas_igor', BILLING_ENABLED: 'true',
  };

  it('empresa adicional NUNCA herda credenciais da principal', () => {
    withEnv(principal);
    for (const k of SCOPED) vi.stubEnv(k, '');
    resetIntegrationEnvCache();
    expect(integrationStatus().sicoob.ready).toBe(true);
    const pri = integrationStatus('priscilla');
    expect(pri.sicoob.ready).toBe(false);
    expect(pri.fiscal.ready).toBe(false);
    expect(pri.fiscal.missing.join(' ')).toMatch(/Token/);
    // ajustes gerais são compartilhados
    expect(pri.billingEnabled).toBe(true);
    expect(pri.fiscal.provider).toBe('notaas');
    expect(pri.sicoob.environment).toBe('production');
  });

  it('com as próprias variáveis, a empresa adicional fica pronta', () => {
    withEnv(principal);
    vi.stubEnv('EMPRESA_PRISCILLA_SICOOB_CLIENT_ID', 'pri');
    vi.stubEnv('EMPRESA_PRISCILLA_SICOOB_CERT_BASE64', 'REVG');
    vi.stubEnv('EMPRESA_PRISCILLA_SICOOB_CERT_PASSWORD', 'y');
    vi.stubEnv('EMPRESA_PRISCILLA_SICOOB_NUMERO_CLIENTE', '999');
    vi.stubEnv('EMPRESA_PRISCILLA_SICOOB_CONTA_CORRENTE', '37766-0');
    vi.stubEnv('EMPRESA_PRISCILLA_FISCAL_API_TOKEN', 'ntaas_pri');
    resetIntegrationEnvCache();
    const pri = integrationStatus('PRISCILLA');
    expect(pri.sicoob.ready).toBe(true);
    expect(pri.fiscal.ready).toBe(true);
    expect(JSON.stringify(pri)).not.toContain('ntaas_pri');
  });
});
