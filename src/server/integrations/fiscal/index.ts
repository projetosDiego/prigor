/**
 * Escolhe o adapter do provedor fiscal conforme `FISCAL_PROVIDER`.
 * Nenhum adapter concreto ainda: entra na fase 4, depois da escolha.
 */
import { integrationStatus } from '../config';
import { FiscalProviderNotConfiguredError, type FiscalProvider } from './provider';

export function fiscalProvider(): FiscalProvider {
  const status = integrationStatus().fiscal;
  if (!status.ready) throw new FiscalProviderNotConfiguredError(status.missing);
  throw new FiscalProviderNotConfiguredError([`adapter para "${status.provider}" (fase 4)`]);
}

export type { FiscalProvider } from './provider';
