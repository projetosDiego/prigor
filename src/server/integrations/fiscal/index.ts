/** Escolhe o adapter do provedor fiscal conforme `FISCAL_PROVIDER`. */
import { integrationStatus, normalizeScope } from '../config';
import { notaasProvider } from './notaas';
import { FiscalProviderNotConfiguredError, type FiscalProvider } from './provider';

export function fiscalProvider(scope?: string | null): FiscalProvider {
  const status = integrationStatus(scope).fiscal;
  if (!status.ready) throw new FiscalProviderNotConfiguredError(status.missing);
  if (status.provider === 'notaas') return notaasProvider(normalizeScope(scope));
  throw new FiscalProviderNotConfiguredError([`adapter para "${status.provider}"`]);
}

export { FiscalProviderError, FiscalProviderNotConfiguredError } from './provider';
export type { FiscalProvider, FiscalInvoiceRequest, FiscalInvoiceResult } from './provider';
