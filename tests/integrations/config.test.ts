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
