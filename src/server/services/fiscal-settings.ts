/**
 * Configuração fiscal da empresa (linha única em `config_fiscal`).
 * Leitura: gerência. Escrita: só administrador, com trilha em auditoria.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db';
import type { SessionPayload } from '../auth/guard';
import { integrationStatus, type IntegrationStatus } from '../integrations/config';
import type { FiscalSettingsUpdate } from '../validation/billing';
import { num, timestamp } from './serializers';

export interface FiscalSettingsDTO {
  id: string;
  cnpj: string | null;
  ie: string | null;
  legalName: string | null;
  tradeName: string | null;
  crt: number;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  nfeSeries: number;
  nfeEnvironment: string;
  defaultCfopInState: string | null;
  defaultCfopOutState: string | null;
  defaultCsosn: string | null;
  invoiceForConsumers: boolean;
  boletoInstructions: string | null;
  boletoFinePct: number | null;
  boletoInterestPct: number | null;
  updatedAt: string | null;
}

type Row = Prisma.FiscalSettingsGetPayload<object>;

function toDTO(r: Row): FiscalSettingsDTO {
  return {
    ...r,
    boletoFinePct: r.boletoFinePct == null ? null : num(r.boletoFinePct),
    boletoInterestPct: r.boletoInterestPct == null ? null : num(r.boletoInterestPct),
    updatedAt: timestamp(r.updatedAt),
  };
}

/** Linha única; cria vazia (com os padrões do schema) na primeira leitura. */
async function getOrCreate(): Promise<Row> {
  return (await prisma.fiscalSettings.findFirst()) ?? prisma.fiscalSettings.create({ data: {} });
}

export async function getFiscalSettings(): Promise<{
  settings: FiscalSettingsDTO;
  integrations: IntegrationStatus;
}> {
  return { settings: toDTO(await getOrCreate()), integrations: integrationStatus() };
}

export async function updateFiscalSettings(
  session: SessionPayload,
  input: FiscalSettingsUpdate,
): Promise<FiscalSettingsDTO> {
  const current = await getOrCreate();
  const data = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Prisma.FiscalSettingsUpdateInput;

  const updated = await prisma.fiscalSettings.update({ where: { id: current.id }, data });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'CHANGE_FISCAL_SETTINGS',
      entity: 'FiscalSettings',
      entityId: updated.id,
      oldValue: current as unknown as Prisma.InputJsonValue,
      newValue: updated as unknown as Prisma.InputJsonValue,
    },
  });

  return toDTO(updated);
}
