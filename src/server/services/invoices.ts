/**
 * Nota fiscal (NF-e) do pedido — caminho MANUAL, acionado pela gerência.
 *
 * Emissão:
 *  1. confere provedor configurado (FISCAL_ENV decide homologação × produção);
 *  2. regras: pedido válido, sem outra NF ativa, cliente PF só se permitido,
 *     sem desconto/frete (ainda não validado), dados fiscais completos;
 *  3. grava a nota como `processando` ANTES de chamar o provedor (referência
 *     única impede duplicidade) e envia; erro fica registrado na nota.
 *
 * A autorização é assíncrona: "Atualizar status" consulta o provedor
 * (o webhook da fase 3 fará isso sozinho).
 */
import type { Prisma } from '@prisma/client';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound, validationError } from '../http/errors';
import { logger } from '../http/logger';
import { type SessionPayload, isManagement } from '../auth/guard';
import { buildInvoiceRef, nextSequence } from '../domain/billing';
import {
  buildInfCpl,
  canCancelInvoice,
  distributeDiscount,
  ieIndicatorFor,
  invoiceAdjustmentsBlocker,
  invoiceReadinessProblems,
  paymentCodeFor,
  resolveCfop,
} from '../domain/invoice';
import { integrationEnv, integrationStatus } from '../integrations/config';
import {
  fiscalProvider,
  FiscalProviderError,
  FiscalProviderNotConfiguredError,
  type FiscalInvoiceResult,
} from '../integrations/fiscal';
import { lookupStateRegistration } from '../integrations/cnpjws';
import { renderDanfe } from './danfe-pdf';
import { logOrderEvent } from './order-history';
import { canAccessOrderDoc, type DocAccess } from './doc-access';
import { timestamp } from './serializers';

export type InvoiceStatus = 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro' | 'descartada';

export interface InvoiceDTO {
  id: string;
  orderId: string;
  ref: string;
  number: number | null;
  series: number | null;
  accessKey: string | null;
  status: InvoiceStatus;
  rejectionReason: string | null;
  authorizedAt: string | null;
  canceledAt: string | null;
  canCancel: boolean;
  environment: string | null;
  createdAt: string | null;
}

type InvoiceRow = Prisma.InvoiceGetPayload<object>;

function toDTO(r: InvoiceRow): InvoiceDTO {
  const raw = (r.raw ?? {}) as { environment?: string };
  return {
    id: r.id,
    orderId: r.orderId,
    ref: r.providerRef,
    number: r.number,
    series: r.series,
    accessKey: r.accessKey,
    status: r.status as InvoiceStatus,
    rejectionReason: r.rejectionReason,
    authorizedAt: timestamp(r.authorizedAt),
    canceledAt: timestamp(r.canceledAt),
    canCancel: r.status === 'autorizada' && canCancelInvoice(r.authorizedAt, new Date()),
    environment: raw.environment ?? null,
    createdAt: timestamp(r.createdAt),
  };
}

const ACTIVE: InvoiceStatus[] = ['processando', 'autorizada'];

function assertFiscalReady(): void {
  const s = integrationStatus();
  if (!s.fiscal.ready) throw conflict(`Nota fiscal não configurada: falta ${s.fiscal.missing.join(', ')}.`);
}

function describeError(err: unknown): string {
  if (err instanceof FiscalProviderError || err instanceof FiscalProviderNotConfiguredError) return err.message.slice(0, 500);
  if (err instanceof Error) return err.message.slice(0, 500);
  return 'Erro desconhecido no provedor fiscal.';
}

/** Código IBGE do município pelo CEP (ViaCEP). */
async function ibgeByCep(cep: string): Promise<string | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ibge?: string; erro?: boolean };
    return data.erro ? null : (data.ibge ?? null);
  } catch (error) {
    logger.warn('consulta de IBGE por CEP falhou', { route: 'invoices.ibge', error });
    return null;
  }
}

/** Grava o resultado do provedor na nota e registra a mudança na timeline. */
async function applyResult(
  row: InvoiceRow,
  result: FiscalInvoiceResult,
  userId: string | null,
): Promise<InvoiceRow> {
  // O que foi enviado (ex.: situação da IE) acompanha a rejeição, para diagnóstico.
  const sent = ((row.raw ?? {}) as { sent?: string }).sent;
  if (result.status === 'rejeitada' && sent && /\b(IE|inscri)/i.test(result.rejectionReason ?? '')) {
    result = { ...result, rejectionReason: `${result.rejectionReason} (${sent})` };
  }
  const updated = await prisma.invoice.update({
    where: { id: row.id },
    data: {
      providerId: result.providerId,
      status: result.status,
      number: result.number ?? row.number,
      series: result.series ?? row.series,
      accessKey: result.accessKey ?? row.accessKey,
      rejectionReason: result.status === 'rejeitada' ? result.rejectionReason : null,
      authorizedAt:
        result.status === 'autorizada' && !row.authorizedAt
          ? result.authorizedAt ? new Date(result.authorizedAt) : new Date()
          : row.authorizedAt,
      canceledAt: result.status === 'cancelada' && !row.canceledAt ? new Date() : row.canceledAt,
      raw: { environment: integrationEnv().FISCAL_ENV, sent, response: result.raw } as Prisma.InputJsonValue,
    },
  });
  if (updated.status !== row.status) {
    const action =
      updated.status === 'autorizada' ? 'nf_autorizada'
      : updated.status === 'rejeitada' ? 'nf_rejeitada'
      : updated.status === 'cancelada' ? 'nf_cancelada'
      : null;
    if (action) await logOrderEvent(prisma, { orderId: row.orderId, userId, action, to: row.providerRef });
  }
  return updated;
}

async function loadInvoiceForAccess(session: DocAccess, id: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { order: { select: { id: true, sellerId: true, numero: true } } },
  });
  if (!inv) throw notFound('Nota fiscal');
  if (!canAccessOrderDoc(session, inv.order)) throw notFound('Nota fiscal');
  return inv;
}

// ─── Leitura ────────────────────────────────────────────────────────────────

export async function listOrderInvoices(
  session: SessionPayload,
  orderId: string,
): Promise<{ data: InvoiceDTO[]; defaultMessage: string; orderNotes: string | null }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { sellerId: true, notes: true } });
  if (!order) throw notFound('Pedido');
  if (!isManagement(session) && order.sellerId !== session.sellerId) throw notFound('Pedido');
  const [rows, settings] = await Promise.all([
    prisma.invoice.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } }),
    prisma.fiscalSettings.findFirst({ select: { invoiceMessage: true } }),
  ]);
  return { data: rows.map(toDTO), defaultMessage: settings?.invoiceMessage ?? '', orderNotes: order.notes };
}

export interface IssueInvoiceOptions {
  /** Mensagem desta nota (padrão: a da Configuração Fiscal). */
  message?: string | null;
  /** Observação específica deste pedido. */
  notes?: string | null;
}

// ─── Emissão ────────────────────────────────────────────────────────────────

export async function issueInvoice(
  session: SessionPayload,
  orderId: string,
  options: IssueInvoiceOptions = {},
): Promise<InvoiceDTO> {
  assertFiscalReady();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      numero: true,
      status: true,
      total: true,
      discount: true,
      shipping: true,
      otherCosts: true,
      paymentMethod: true,
      dueDate: true,
      customerId: true,
      customer: {
        select: {
          tradeName: true, legalName: true, cnpj: true, cpf: true, ie: true, ieIndicator: true, email: true,
          address: true, number: true, complement: true, neighborhood: true, city: true, state: true, zipCode: true,
        },
      },
      items: {
        select: {
          quantity: true, unitPrice: true, discountItem: true, subtotal: true,
          product: { select: { id: true, sku: true, internalCode: true, name: true, unit: true, ncm: true, cfop: true } },
        },
      },
      invoices: { select: { status: true, providerRef: true } },
    },
  });
  if (!order) throw notFound('Pedido');
  if (order.status === 'cancelado') throw conflict('Pedido cancelado não pode emitir nota fiscal.');
  if (order.invoices.some((i: { status: string }) => ACTIVE.includes(i.status as InvoiceStatus))) {
    throw conflict('Este pedido já tem nota fiscal autorizada ou em processamento.');
  }

  const settings = await prisma.fiscalSettings.findFirst();
  const c = { ...order.customer };

  // IE nunca verificada em cliente com CNPJ → consulta automática (CNPJ.ws) e grava.
  // Falha na consulta não trava: segue como não contribuinte e a SEFAZ dirá se precisar.
  if ((c.cnpj ?? '').replace(/\D/g, '').length === 14 && !c.ie && !c.ieIndicator) {
    try {
      const reg = await lookupStateRegistration(c.cnpj!, c.state);
      await prisma.customer.update({ where: { id: order.customerId }, data: { ie: reg.ie, ieIndicator: reg.indicator } });
      c.ie = reg.ie;
      c.ieIndicator = reg.indicator;
    } catch (error) {
      logger.warn('consulta automática de IE falhou', { route: 'invoices.issue', error });
    }
  }
  const isConsumer = (c.cnpj ?? '').replace(/\D/g, '').length !== 14;
  if (isConsumer && !settings?.invoiceForConsumers) {
    throw conflict('Cliente sem CNPJ. Para emitir NF para pessoa física, ative a opção em Configuração Fiscal.');
  }

  const adjustments = invoiceAdjustmentsBlocker({ otherCosts: String(order.otherCosts) });
  if (adjustments) throw conflict(adjustments);

  const issuerState = settings?.state ?? null;
  const problems = invoiceReadinessProblems({
    issuer: settings
      ? {
          cnpj: settings.cnpj, ie: settings.ie, legalName: settings.legalName, address: settings.address,
          number: settings.number, neighborhood: settings.neighborhood, city: settings.city,
          cityIbgeCode: settings.cityIbgeCode, state: settings.state, zipCode: settings.zipCode,
          defaultCfopInState: settings.defaultCfopInState, defaultCfopOutState: settings.defaultCfopOutState,
          defaultCsosn: settings.defaultCsosn,
        }
      : null,
    customer: c,
    items: order.items.map((i: { product: { name: string; ncm: string | null; cfop: string | null } }) => ({
      name: i.product.name, ncm: i.product.ncm, cfop: i.product.cfop,
    })),
    issuerManagedByProvider: true,
  });

  const cityIbgeCode = problems.length ? null : await ibgeByCep(c.zipCode ?? '');
  if (!problems.length && !cityIbgeCode) problems.push('Não encontrei o município pelo CEP do cliente. Confira o CEP.');
  if (problems.length) {
    throw validationError(`Corrija antes de emitir: ${problems.join(' ')}`, { problems });
  }

  const ref = buildInvoiceRef(order.numero, nextSequence(order.invoices.map((i: { providerRef: string }) => i.providerRef)));
  let row: InvoiceRow;
  try {
    row = await prisma.invoice.create({
      data: { orderId: order.id, providerRef: ref, status: 'processando', createdById: session.userId },
    });
  } catch (err) {
    if (prismaErrorCode(err) === UNIQUE_VIOLATION) throw conflict('Já existe uma nota sendo emitida para este pedido.');
    throw err;
  }

  const csosn = settings!.defaultCsosn!;
  const ieIndicator = ieIndicatorFor(c.ie, c.ieIndicator);
  // Resumo do que foi enviado sobre a IE — aparece junto da rejeição para facilitar o diagnóstico.
  const ieSent = `enviado: ${ieIndicator === 1 ? `contribuinte, IE ${c.ie}` : ieIndicator === 2 ? 'isento' : 'não contribuinte, sem IE'}`;
  // Valor bruto por item (qtd × unitário) e desconto total do item (item + rateio do pedido).
  const gross = order.items.map((i: { quantity: unknown; unitPrice: unknown }) =>
    (Math.round(Number(i.quantity) * Number(i.unitPrice) * 100) / 100).toFixed(2),
  );
  const discounts = distributeDiscount(
    order.items.map((i: { discountItem: unknown }, k: number) => ({ gross: gross[k], itemDiscount: String(i.discountItem) })),
    String(order.discount),
  );
  const paymentCode = paymentCodeFor(order.paymentMethod);
  const dueIso = order.dueDate ? order.dueDate.toISOString().slice(0, 10) : null;
  const message = options.message !== undefined ? options.message : settings?.invoiceMessage ?? null;
  let result: FiscalInvoiceResult;
  try {
    result = await fiscalProvider().issue({
      ref,
      environment: integrationEnv().FISCAL_ENV,
      operationNature: 'Venda de mercadoria',
      recipient: {
        name: c.legalName || c.tradeName,
        cnpj: c.cnpj,
        cpf: c.cpf,
        ie: c.ie,
        ieIndicator,
        email: c.email,
        address: {
          street: c.address ?? '',
          number: c.number ?? 'S/N',
          complement: c.complement,
          neighborhood: c.neighborhood ?? '',
          city: c.city ?? '',
          cityIbgeCode: cityIbgeCode!,
          state: c.state ?? '',
          zipCode: c.zipCode ?? '',
        },
      },
      items: order.items.map(
        (i: {
          quantity: unknown; unitPrice: unknown; subtotal: unknown;
          product: { id: string; sku: string | null; internalCode: string | null; name: string; unit: string; ncm: string | null; cfop: string | null };
        }, k: number) => ({
          code: i.product.sku || i.product.internalCode || i.product.id.slice(0, 8),
          description: i.product.name,
          ncm: i.product.ncm!,
          cfop: resolveCfop(i.product.cfop, issuerState, c.state, {
            inState: settings!.defaultCfopInState,
            outState: settings!.defaultCfopOutState,
          })!,
          csosn,
          unit: i.product.unit || 'UN',
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
          total: gross[k],
          discount: discounts[k],
        }),
      ),
      payments: [{ code: paymentCode, value: String(order.total) }],
      shipping: String(order.shipping),
      billing:
        paymentCode === '15' && dueIso
          ? {
              invoiceNumber: `PED-${order.numero}`,
              original: String(order.total),
              discount: '0.00',
              net: String(order.total),
              installments: [{ number: '001', dueDate: dueIso, value: String(order.total) }],
            }
          : null,
      additionalInfo: buildInfCpl({ orderNumber: order.numero, message, notes: options.notes }),
    });
  } catch (err) {
    const message = `Provedor recusou a nota: ${describeError(err)}`;
    await prisma.invoice.update({
      where: { id: row.id },
      data: {
        status: 'erro',
        rejectionReason: message,
        raw: err instanceof FiscalProviderError ? ({ error: err.body ?? null } as Prisma.InputJsonValue) : undefined,
      },
    });
    throw badRequest(message);
  }

  // Daqui em diante a nota EXISTE no provedor: nunca marcar como erro (geraria
  // nota órfã e permitiria emitir outra). Se gravar o retorno falhar, guarda o
  // id do provedor no texto para recuperar e devolve erro de sistema.
  try {
    await prisma.invoice.update({ where: { id: row.id }, data: { raw: { sent: ieSent } as Prisma.InputJsonValue } });
    row = { ...row, raw: { sent: ieSent } as Prisma.JsonValue };
    row = await applyResult(row, result, session.userId);
  } catch (err) {
    logger.error('NF aceita pelo provedor, mas falhou ao gravar o retorno', {
      route: 'invoices.issue', orderId: order.id, ref, providerId: result.providerId, error: err,
    });
    await prisma.invoice
      .update({
        where: { id: row.id },
        data: { rejectionReason: `Enviada ao provedor (id ${result.providerId}), mas o retorno não foi gravado. Não emita outra; chame o suporte técnico.` },
      })
      .catch(() => undefined);
    throw conflict(`A nota foi enviada (id ${result.providerId}), mas houve erro ao gravar o retorno no PRIGOR. Não emita de novo.`);
  }
  await logOrderEvent(prisma, { orderId: order.id, userId: session.userId, action: 'nf_enviada', to: ref });
  return toDTO(row);
}

// ─── Status, cancelamento, documentos ───────────────────────────────────────

export async function refreshInvoice(session: SessionPayload, id: string): Promise<InvoiceDTO> {
  assertFiscalReady();
  const inv = await loadInvoiceForAccess(session, id);
  if (!inv.providerId) throw conflict('Esta nota não chegou ao provedor.');
  try {
    const result = await fiscalProvider().get(inv.providerId);
    return toDTO(await applyResult(inv, result, session.userId));
  } catch (err) {
    throw badRequest(`Não consegui consultar a nota: ${describeError(err)}`);
  }
}

export async function cancelInvoice(session: SessionPayload, id: string, reason: string): Promise<InvoiceDTO> {
  assertFiscalReady();
  const inv = await loadInvoiceForAccess(session, id);
  if (inv.status !== 'autorizada' || !inv.providerId) throw conflict('Só nota autorizada pode ser cancelada.');
  if (!canCancelInvoice(inv.authorizedAt, new Date())) {
    throw conflict('Prazo de cancelamento (24h) encerrado. Fale com o contador sobre nota de devolução.');
  }
  try {
    const result = await fiscalProvider().cancel(inv.providerId, reason);
    // Cancelamento entra em fila no provedor: mantém autorizada até a consulta confirmar.
    const next: FiscalInvoiceResult = result.status === 'cancelada' ? result : { ...result, status: 'autorizada' };
    return toDTO(await applyResult(inv, next, session.userId));
  } catch (err) {
    throw badRequest(`O provedor não aceitou o cancelamento: ${describeError(err)}`);
  }
}

/** Descarta tentativa que nem chegou ao provedor (status erro). */
export async function discardInvoice(session: SessionPayload, id: string): Promise<InvoiceDTO> {
  const inv = await loadInvoiceForAccess(session, id);
  if (inv.status !== 'erro' && inv.status !== 'rejeitada') throw conflict('Só nota com erro ou rejeitada pode ser descartada.');
  const updated = await prisma.invoice.update({ where: { id }, data: { status: 'descartada' } });
  return toDTO(updated);
}

export async function invoiceDocument(
  session: DocAccess,
  id: string,
  kind: 'danfe' | 'xml',
): Promise<{ data: Buffer; filename: string; contentType: string }> {
  const inv = await loadInvoiceForAccess(session, id);
  if (!inv.providerId || !['autorizada', 'cancelada'].includes(inv.status)) {
    throw conflict('Documento disponível só para nota autorizada ou cancelada.');
  }
  try {
    const provider = fiscalProvider();
    const data = kind === 'danfe' ? await provider.danfe(inv.providerId) : await provider.xml(inv.providerId);
    const base = `nfe-${inv.number ?? inv.providerRef}-pedido-${inv.order.numero}`;
    return kind === 'danfe'
      ? { data, filename: `${base}.pdf`, contentType: 'application/pdf' }
      : { data, filename: `${base}.xml`, contentType: 'application/xml' };
  } catch (err) {
    throw badRequest(`Não consegui baixar o documento: ${describeError(err)}`);
  }
}

/**
 * DANFE: o da Prigor (gerado do XML autorizado) por padrão; o do provedor se
 * pedido ou se o gerador próprio falhar — a nota nunca fica sem DANFE.
 */
export async function invoiceDanfe(
  session: DocAccess,
  id: string,
  opts: { provider?: boolean } = {},
): Promise<{ data: Buffer; filename: string }> {
  const inv = await loadInvoiceForAccess(session, id);
  if (!inv.providerId || !['autorizada', 'cancelada'].includes(inv.status)) {
    throw conflict('DANFE disponível só para nota autorizada ou cancelada.');
  }
  const filename = `danfe-nfe-${inv.number ?? inv.providerRef}-pedido-${inv.order.numero}.pdf`;
  const provider = fiscalProvider();
  if (!opts.provider) {
    try {
      const xml = (await provider.xml(inv.providerId)).toString('utf8');
      const settings = await prisma.fiscalSettings.findFirst({ select: { tradeName: true, phone: true } });
      const pdf = await renderDanfe(xml, {
        brandName: settings?.tradeName || 'Doces Prigor',
        phone: settings?.phone,
        cancelled: inv.status === 'cancelada',
        footer: `Pedido PRIGOR nº ${inv.order.numero} · Doces Prigor · docesprigor.com.br`,
      });
      return { data: pdf, filename };
    } catch (error) {
      logger.warn('DANFE próprio falhou; usando o do provedor', { route: 'invoices.danfe', invoiceId: id, error });
    }
  }
  try {
    return { data: await provider.danfe(inv.providerId), filename };
  } catch (err) {
    throw badRequest(`Não consegui gerar o DANFE: ${describeError(err)}`);
  }
}

