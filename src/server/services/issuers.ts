/**
 * Empresas emissoras: cada CNPJ que emite NF e boleto pelo sistema.
 *
 * Regra do pedido: o CNPJ é escolhido no faturamento (padrão: o do cliente,
 * senão a empresa padrão). Depois que existe NF ou boleto ATIVO, o pedido
 * fica travado naquele CNPJ — nunca nota de um e boleto de outro.
 *
 * Credenciais não ficam no banco: `configPrefix` aponta para as variáveis de
 * ambiente da empresa (ver integrations/config.ts).
 */
import type { Prisma } from '@prisma/client';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { conflict, notFound, validationError } from '../http/errors';
import type { SessionPayload } from '../auth/guard';
import { integrationStatus, scopedVarName } from '../integrations/config';
import { hasActiveDocuments } from '../domain/issuer';
import type { IssuerInput, IssuerUpdate } from '../validation/billing';
import { num, timestamp } from './serializers';

export type IssuerRow = Prisma.IssuerGetPayload<object>;

export interface IssuerDTO {
  id: string;
  name: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  ie: string | null;
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
  configPrefix: string;
  isDefault: boolean;
  active: boolean;
  annualLimit: number;
  /** Situação das integrações desta empresa (sem segredos). */
  integrations: {
    invoice: { ready: boolean; environment: string; missing: string[] };
    boleto: { ready: boolean; enabled: boolean; missing: string[] };
    /** Nome da variável de exemplo, para o administrador saber o prefixo. */
    sampleVar: string;
  };
  updatedAt: string | null;
}

export function toIssuerDTO(r: IssuerRow): IssuerDTO {
  const s = integrationStatus(r.configPrefix);
  return {
    id: r.id,
    name: r.name,
    legalName: r.legalName,
    tradeName: r.tradeName,
    cnpj: r.cnpj,
    ie: r.ie,
    address: r.address,
    number: r.number,
    complement: r.complement,
    neighborhood: r.neighborhood,
    city: r.city,
    cityIbgeCode: r.cityIbgeCode,
    state: r.state,
    zipCode: r.zipCode,
    phone: r.phone,
    email: r.email,
    configPrefix: r.configPrefix,
    isDefault: r.isDefault,
    active: r.active,
    annualLimit: num(r.annualLimit),
    integrations: {
      invoice: { ready: s.fiscal.ready, environment: s.fiscal.environment, missing: s.fiscal.missing },
      boleto: { ready: s.billingEnabled && s.sicoob.ready, enabled: s.billingEnabled, missing: s.sicoob.missing },
      sampleVar: scopedVarName(r.configPrefix, 'SICOOB_CLIENT_ID'),
    },
    updatedAt: timestamp(r.updatedAt),
  };
}

/**
 * Garante a empresa principal: se a tabela estiver vazia (instalação nova),
 * cria a partir do emitente da Configuração Fiscal.
 */
async function ensurePrincipal(): Promise<void> {
  if ((await prisma.issuer.count()) > 0) return;
  const s = await prisma.fiscalSettings.findFirst();
  const cnpj = (s?.cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) return;
  await prisma.issuer
    .create({
      data: {
        name: 'Principal',
        legalName: s?.legalName || 'EMPRESA PRINCIPAL',
        tradeName: s?.tradeName,
        cnpj,
        ie: s?.ie,
        address: s?.address,
        number: s?.number,
        complement: s?.complement,
        neighborhood: s?.neighborhood,
        city: s?.city,
        cityIbgeCode: s?.cityIbgeCode,
        state: s?.state,
        zipCode: s?.zipCode,
        phone: s?.phone,
        email: s?.email,
        configPrefix: '',
        isDefault: true,
      },
    })
    .catch((err) => {
      if (prismaErrorCode(err) !== UNIQUE_VIOLATION) throw err; // corrida: outra requisição criou
    });
}

export async function listIssuers(opts: { includeInactive?: boolean } = {}): Promise<IssuerDTO[]> {
  await ensurePrincipal();
  const rows = await prisma.issuer.findMany({
    where: opts.includeInactive ? {} : { active: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toIssuerDTO);
}

export async function defaultIssuer(): Promise<IssuerRow | null> {
  await ensurePrincipal();
  return (
    (await prisma.issuer.findFirst({ where: { active: true, isDefault: true } })) ??
    (await prisma.issuer.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } }))
  );
}

/**
 * Empresa que vai emitir o documento deste pedido.
 * Escolha (quando permitida): pedida na tela → já gravada no pedido → padrão do cliente → empresa padrão.
 * Grava a escolha no pedido.
 */
export async function resolveOrderIssuer(orderId: string, requestedId?: string | null): Promise<IssuerRow> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      issuerId: true,
      customer: { select: { defaultIssuerId: true } },
      boletos: { select: { status: true } },
      invoices: { select: { status: true } },
      issuer: true,
    },
  });
  if (!order) throw notFound('Pedido');

  const locked = Boolean(order.issuerId) && hasActiveDocuments(order);
  if (locked) {
    if (requestedId && requestedId !== order.issuerId) {
      throw conflict(
        `Este pedido já tem nota ou boleto pelo CNPJ de ${order.issuer?.name ?? 'outra empresa'}. ` +
          'Para trocar, cancele/baixe os documentos ativos primeiro.',
      );
    }
    return order.issuer!;
  }

  const candidateId = requestedId ?? order.issuerId ?? order.customer.defaultIssuerId ?? null;
  let issuer = candidateId ? await prisma.issuer.findUnique({ where: { id: candidateId } }) : null;
  if (requestedId && !issuer) throw notFound('Empresa emissora');
  if (issuer && !issuer.active) {
    if (requestedId) throw conflict(`A empresa ${issuer.name} está inativa.`);
    issuer = null;
  }
  issuer ??= await defaultIssuer();
  if (!issuer) {
    throw conflict('Nenhuma empresa emissora cadastrada. Cadastre em Configuração Fiscal → Empresas.');
  }
  if (order.issuerId !== issuer.id) {
    await prisma.order.update({ where: { id: order.id }, data: { issuerId: issuer.id } });
  }
  return issuer;
}

/** Empresa de um documento já emitido (NF/boleto antigos sem vínculo → principal). */
export async function issuerForDocument(issuerId: string | null): Promise<IssuerRow | null> {
  if (issuerId) return prisma.issuer.findUnique({ where: { id: issuerId } });
  return defaultIssuer();
}

// ─── Cadastro (administrador) ──────────────────────────────────────────────

function cleanData<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as T;
}

async function audit(session: SessionPayload, action: string, entityId: string, oldValue: unknown, newValue: unknown) {
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action,
      entity: 'Issuer',
      entityId,
      oldValue: (oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: newValue as Prisma.InputJsonValue,
    },
  });
}

function uniqueError(err: unknown): never {
  if (prismaErrorCode(err) === UNIQUE_VIOLATION) {
    throw conflict('Já existe empresa com este CNPJ ou com este prefixo de configuração.');
  }
  throw err;
}

export async function createIssuer(session: SessionPayload, input: IssuerInput): Promise<IssuerDTO> {
  const data = cleanData(input) as Prisma.IssuerCreateInput;
  const created = await prisma
    .$transaction(async (tx) => {
      if (input.isDefault) await tx.issuer.updateMany({ data: { isDefault: false } });
      return tx.issuer.create({ data });
    })
    .catch(uniqueError);
  await audit(session, 'CREATE_ISSUER', created.id, null, created);
  return toIssuerDTO(created);
}

export async function updateIssuer(session: SessionPayload, id: string, input: IssuerUpdate): Promise<IssuerDTO> {
  const current = await prisma.issuer.findUnique({ where: { id } });
  if (!current) throw notFound('Empresa emissora');
  if (input.active === false && (input.isDefault ?? current.isDefault)) {
    throw validationError('A empresa padrão não pode ficar inativa. Escolha outra como padrão antes.');
  }
  if (input.isDefault === false && current.isDefault) {
    throw validationError('Marque outra empresa como padrão (isso desmarca esta automaticamente).');
  }
  const data = cleanData(input) as Prisma.IssuerUpdateInput;
  const updated = await prisma
    .$transaction(async (tx) => {
      if (input.isDefault) await tx.issuer.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx.issuer.update({ where: { id }, data });
    })
    .catch(uniqueError);
  await audit(session, 'UPDATE_ISSUER', id, current, updated);
  return toIssuerDTO(updated);
}
