/**
 * Boletos do pedido (Sicoob) — caminho MANUAL, acionado pela gerência.
 *
 * Fluxo de emissão:
 *  1. confere se a integração está ligada e configurada;
 *  2. regras do domínio (pedido pode gerar boleto? cadastro do cliente completo?);
 *  3. grava o boleto como `pendente_registro` ANTES de chamar o banco — o
 *     `seuNumero` único impede dois boletos iguais em cliques duplos;
 *  4. chama a API; sucesso → `registrado`; falha → `erro` com o motivo.
 *
 * Pagamento: "Atualizar status" consulta o banco; se liquidado, marca o
 * boleto como pago e dá baixa no lançamento a receber do pedido.
 * (Fase 3 faz isso sozinho via webhook + conferência diária.)
 */
import type { Prisma } from '@prisma/client';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound, validationError } from '../http/errors';
import { isManagement, type SessionPayload } from '../auth/guard';
import {
  boletoIssueBlocker,
  boletoPayerProblems,
  buildSeuNumero,
  canTransitionBoleto,
  nextSequence,
  payerDocument,
  type BoletoStatus,
  type OrderStatusForBilling,
} from '../domain/billing';
import { integrationStatus } from '../integrations/config';
import { SicoobApiError, SicoobNotConfiguredError } from '../integrations/sicoob/client';
import {
  sicoobBoletoPdf,
  sicoobGetBoleto,
  sicoobIssueBoleto,
  sicoobWriteOffBoleto,
} from '../integrations/sicoob/boletos';
import { logOrderEvent } from './order-history';
import { dateOnly, num, timestamp } from './serializers';

export interface BoletoDTO {
  id: string;
  orderId: string;
  seuNumero: string;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  pixCopiaECola: string | null;
  value: number;
  dueDate: string | null;
  status: BoletoStatus;
  paidAt: string | null;
  paidValue: number | null;
  lastError: string | null;
  createdAt: string | null;
}

type BoletoRow = Prisma.BoletoGetPayload<object>;

function toDTO(b: BoletoRow): BoletoDTO {
  return {
    id: b.id,
    orderId: b.orderId,
    seuNumero: b.seuNumero,
    nossoNumero: b.nossoNumero,
    linhaDigitavel: b.linhaDigitavel,
    codigoBarras: b.codigoBarras,
    pixCopiaECola: b.pixCopiaECola,
    value: num(b.value),
    dueDate: dateOnly(b.dueDate),
    status: b.status as BoletoStatus,
    paidAt: dateOnly(b.paidAt),
    paidValue: b.paidValue == null ? null : num(b.paidValue),
    lastError: b.lastError,
    createdAt: timestamp(b.createdAt),
  };
}

/** Data de hoje no fuso de São Paulo, YYYY-MM-DD. */
function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Mensagem curta e útil a partir do erro do Sicoob (sem dados sensíveis). */
function describeSicoobError(err: unknown): string {
  if (err instanceof SicoobApiError) {
    const body = err.body as { mensagens?: Array<{ mensagem?: string }>; message?: string } | null;
    const msgs = body?.mensagens?.map((m) => m.mensagem).filter(Boolean).join('; ');
    return `${err.message}${msgs ? ` ${msgs}` : body?.message ? ` ${body.message}` : ''}`.slice(0, 500);
  }
  if (err instanceof Error) return err.message.slice(0, 500);
  return 'Erro desconhecido ao falar com o Sicoob.';
}

function assertSicoobReady(): void {
  const status = integrationStatus();
  if (!status.billingEnabled) {
    throw conflict('Emissão de boletos desligada. Ative BILLING_ENABLED no .env quando a integração estiver pronta.');
  }
  if (!status.sicoob.ready) {
    throw conflict(`Integração Sicoob incompleta: falta ${status.sicoob.missing.join(', ')}.`);
  }
}

async function loadOrderForAccess(session: SessionPayload, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, sellerId: true } });
  if (!order) throw notFound('Pedido');
  if (!isManagement(session) && order.sellerId !== session.sellerId) throw notFound('Pedido');
  return order;
}

async function loadBoletoForAccess(session: SessionPayload, boletoId: string) {
  const boleto = await prisma.boleto.findUnique({
    where: { id: boletoId },
    include: { order: { select: { sellerId: true, numero: true } } },
  });
  if (!boleto) throw notFound('Boleto');
  if (!isManagement(session) && boleto.order.sellerId !== session.sellerId) throw notFound('Boleto');
  return boleto;
}

// ─── Leitura ────────────────────────────────────────────────────────────────

export async function listOrderBoletos(session: SessionPayload, orderId: string): Promise<BoletoDTO[]> {
  await loadOrderForAccess(session, orderId);
  const rows = await prisma.boleto.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toDTO);
}

// ─── Emissão ────────────────────────────────────────────────────────────────

export async function issueBoleto(session: SessionPayload, orderId: string): Promise<BoletoDTO> {
  assertSicoobReady();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      numero: true,
      status: true,
      total: true,
      dueDate: true,
      customer: {
        select: {
          tradeName: true,
          legalName: true,
          cnpj: true,
          cpf: true,
          email: true,
          address: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
      boletos: { select: { status: true, seuNumero: true } },
      transactions: {
        where: { type: 'receita', status: { not: 'cancelado' } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!order) throw notFound('Pedido');

  const today = todayIso();
  const blocker = boletoIssueBlocker({
    orderStatus: order.status as OrderStatusForBilling,
    orderTotal: String(order.total),
    dueDate: dateOnly(order.dueDate),
    today,
    existingStatuses: order.boletos.map((b: { status: string }) => b.status as BoletoStatus),
  });
  if (blocker) throw conflict(blocker);

  const c = order.customer;
  const missing = boletoPayerProblems(c);
  if (missing.length) {
    throw validationError(`Complete o cadastro antes de gerar o boleto: falta ${missing.join(', ')}.`);
  }

  const settings = await prisma.fiscalSettings.findFirst();
  const seuNumero = buildSeuNumero(order.numero, nextSequence(order.boletos.map((b: { seuNumero: string }) => b.seuNumero)));
  const dueDate = dateOnly(order.dueDate)!;

  let row: BoletoRow;
  try {
    row = await prisma.boleto.create({
      data: {
        orderId: order.id,
        transactionId: order.transactions[0]?.id ?? null,
        seuNumero,
        value: String(order.total),
        dueDate: asDate(dueDate),
        status: 'pendente_registro',
        createdById: session.userId,
      },
    });
  } catch (err) {
    if (prismaErrorCode(err) === UNIQUE_VIOLATION) {
      throw conflict('Já existe um boleto sendo gerado para este pedido. Atualize a tela.');
    }
    throw err;
  }

  try {
    const { boleto, raw } = await sicoobIssueBoleto({
      seuNumero,
      orderNumber: order.numero,
      value: Number(order.total).toFixed(2),
      issueDate: today,
      dueDate,
      payer: {
        document: payerDocument(c),
        name: c.legalName || c.tradeName,
        address: [c.address, c.number, c.complement].filter(Boolean).join(', '),
        neighborhood: c.neighborhood ?? '',
        city: c.city ?? '',
        zipCode: c.zipCode ?? '',
        state: c.state ?? '',
        email: c.email,
      },
      finePct: settings?.boletoFinePct == null ? null : String(settings.boletoFinePct),
      interestMonthPct: settings?.boletoInterestPct == null ? null : String(settings.boletoInterestPct),
      instructions: settings?.boletoInstructions ? [settings.boletoInstructions] : [],
    });

    row = await prisma.boleto.update({
      where: { id: row.id },
      data: {
        status: 'registrado',
        nossoNumero: boleto.nossoNumero,
        linhaDigitavel: boleto.linhaDigitavel,
        codigoBarras: boleto.codigoBarras,
        pixCopiaECola: boleto.pixCopiaECola,
        lastError: null,
        raw: raw as Prisma.InputJsonValue,
      },
    });
    await logOrderEvent(prisma, { orderId: order.id, userId: session.userId, action: 'boleto_emitido', to: seuNumero });
    return toDTO(row);
  } catch (err) {
    const message =
      err instanceof SicoobNotConfiguredError ? err.message : `Sicoob recusou o boleto: ${describeSicoobError(err)}`;
    await prisma.boleto.update({
      where: { id: row.id },
      data: {
        status: 'erro',
        lastError: message,
        raw: err instanceof SicoobApiError ? ((err.body ?? null) as Prisma.InputJsonValue) : undefined,
      },
    });
    await logOrderEvent(prisma, { orderId: order.id, userId: session.userId, action: 'boleto_erro', to: seuNumero });
    throw badRequest(message);
  }
}

// ─── Atualizar status (consulta) ────────────────────────────────────────────

export async function refreshBoleto(session: SessionPayload, boletoId: string): Promise<BoletoDTO> {
  assertSicoobReady();
  const boleto = await loadBoletoForAccess(session, boletoId);
  if (boleto.status !== 'registrado' || !boleto.nossoNumero) {
    throw conflict('Só boletos registrados podem ser consultados no banco.');
  }

  let situation;
  try {
    ({ situation } = await sicoobGetBoleto(boleto.nossoNumero));
  } catch (err) {
    throw badRequest(`Não consegui consultar o boleto: ${describeSicoobError(err)}`);
  }

  if (situation.state === 'pago' && canTransitionBoleto('registrado', 'pago')) {
    const paidAt = situation.paidAt ?? todayIso();
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.boleto.update({
        where: { id: boleto.id },
        data: {
          status: 'pago',
          paidAt: asDate(paidAt),
          paidValue: situation.paidValue ?? undefined,
        },
      });
      // Baixa no financeiro: lançamento a receber do pedido que ainda não foi baixado.
      const receivable = await tx.financialTransaction.findFirst({
        where: {
          orderId: boleto.orderId,
          type: 'receita',
          status: { in: ['pendente', 'atrasado'] },
        },
        select: { id: true },
      });
      if (receivable) {
        await tx.financialTransaction.update({
          where: { id: receivable.id },
          data: { status: 'pago', paymentDate: asDate(paidAt) },
        });
      }
      return row;
    });
    await logOrderEvent(prisma, { orderId: boleto.orderId, userId: session.userId, action: 'boleto_pago', to: boleto.seuNumero });
    return toDTO(updated);
  }

  if (situation.state === 'baixado') {
    const updated = await prisma.boleto.update({ where: { id: boleto.id }, data: { status: 'baixado' } });
    await logOrderEvent(prisma, { orderId: boleto.orderId, userId: session.userId, action: 'boleto_baixado', to: boleto.seuNumero });
    return toDTO(updated);
  }

  return toDTO(boleto);
}

// ─── Baixa (cancelar no banco) ──────────────────────────────────────────────

export async function writeOffBoleto(session: SessionPayload, boletoId: string): Promise<BoletoDTO> {
  const boleto = await loadBoletoForAccess(session, boletoId);

  // Boleto que nem chegou a registrar no banco: só descarta aqui (não chama o Sicoob).
  if (boleto.status === 'erro' || boleto.status === 'pendente_registro') {
    const updated = await prisma.boleto.update({ where: { id: boleto.id }, data: { status: 'cancelado' } });
    return toDTO(updated);
  }
  assertSicoobReady();
  if (!canTransitionBoleto(boleto.status as BoletoStatus, 'baixado') || !boleto.nossoNumero) {
    throw conflict(boleto.status === 'pago' ? 'Boleto pago não pode ser baixado.' : 'Este boleto não está em aberto.');
  }

  try {
    await sicoobWriteOffBoleto(boleto.nossoNumero);
  } catch (err) {
    throw badRequest(`O Sicoob não aceitou a baixa: ${describeSicoobError(err)}`);
  }
  const updated = await prisma.boleto.update({ where: { id: boleto.id }, data: { status: 'baixado' } });
  await logOrderEvent(prisma, { orderId: boleto.orderId, userId: session.userId, action: 'boleto_baixado', to: boleto.seuNumero });
  return toDTO(updated);
}

// ─── PDF ────────────────────────────────────────────────────────────────────

export async function boletoPdf(session: SessionPayload, boletoId: string): Promise<{ pdf: Buffer; filename: string }> {
  const boleto = await loadBoletoForAccess(session, boletoId);
  if (!boleto.nossoNumero || !['registrado', 'pago'].includes(boleto.status)) {
    throw conflict('Este boleto não tem PDF disponível.');
  }
  try {
    return { pdf: await sicoobBoletoPdf(boleto.nossoNumero), filename: `boleto-pedido-${boleto.order.numero}.pdf` };
  } catch (err) {
    throw badRequest(`Não consegui baixar o PDF do boleto: ${describeSicoobError(err)}`);
  }
}
