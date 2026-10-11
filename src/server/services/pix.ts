/**
 * Pix recebidos → sugestão de baixa dos títulos em aberto.
 *
 * Fontes: API Pix do Sicoob (quando habilitada) ou extrato OFX/CSV colado/enviado.
 * Nada é baixado sem a pessoa confirmar; o valor precisa fechar ao centavo.
 */
import { prisma } from '../db';
import { logger } from '../http/logger';
import { badRequest, conflict, notFound } from '../http/errors';
import type { SessionPayload } from '../auth/guard';
import { suggestForPix, type OpenTitle, type PixSuggestion } from '../domain/pix-match';
import { parseStatement } from '../domain/pix-statement';
import { integrationEnv, integrationStatus } from '../integrations/config';
import { sicoobListPixReceived } from '../integrations/sicoob/pix';
import { SicoobApiError, SicoobNotConfiguredError } from '../integrations/sicoob/client';
import { writeOffBoleto } from './boletos';
import { settleTransaction } from './financial';
import { dateOnly, num } from './serializers';

export interface PixRowDTO {
  id: string;
  value: number;
  /** AAAA-MM-DD */
  date: string;
  payerName: string | null;
  description: string | null;
  source: string;
  suggestions: Array<PixSuggestion & { titles: Array<{ transactionId: string; orderNumero: number; dueDate: string | null; value: number }> }>;
}

export interface PixListDTO {
  rows: PixRowDTO[];
  /** Pix já conciliados nos últimos 30 dias (para dar confiança de que nada se perdeu). */
  recentlySettled: number;
  bank: { available: boolean; reason: string | null };
}

const cents = (v: number) => Math.round(v * 100);

// ─── Entrada ────────────────────────────────────────────────────────────────

interface IncomingPix {
  externalId: string;
  value: number;
  receivedAt: Date;
  payerName: string | null;
  payerDocument: string | null;
  description: string | null;
  source: 'sicoob' | 'extrato';
}

async function saveIncoming(items: IncomingPix[]): Promise<{ imported: number; duplicates: number }> {
  if (items.length === 0) return { imported: 0, duplicates: 0 };
  const res = await prisma.pixReceived.createMany({
    data: items.map((i) => ({
      externalId: i.externalId,
      value: i.value,
      receivedAt: i.receivedAt,
      payerName: i.payerName,
      payerDocument: i.payerDocument,
      description: i.description,
      source: i.source,
    })),
    skipDuplicates: true,
  });
  return { imported: res.count, duplicates: items.length - res.count };
}

export async function importStatement(text: string) {
  if (!text.trim()) throw badRequest('Cole ou envie o extrato (OFX ou CSV).');
  const parsed = parseStatement(text);
  const result = await saveIncoming(
    parsed.pix.map((p) => ({
      externalId: p.externalId,
      value: p.value,
      receivedAt: new Date(`${p.date}T12:00:00Z`),
      payerName: p.payerName,
      payerDocument: p.payerDocument,
      description: p.description,
      source: 'extrato' as const,
    })),
  );
  return { format: parsed.format, found: parsed.pix.length, ignored: parsed.ignored, ...result };
}

function bankAvailability(): { available: boolean; reason: string | null } {
  const status = integrationStatus('');
  if (!status.sicoob.ready) return { available: false, reason: `Integração Sicoob incompleta: falta ${status.sicoob.missing.join(', ')}.` };
  if (integrationEnv('').SICOOB_ENV === 'sandbox') return { available: true, reason: 'Ambiente de testes (sandbox) do Sicoob.' };
  return { available: true, reason: null };
}

export async function fetchFromBank(days = 7) {
  const avail = bankAvailability();
  if (!avail.available) throw conflict(avail.reason ?? 'Sicoob não configurado.');
  const to = new Date();
  const from = new Date(to.getTime() - Math.min(Math.max(days, 1), 30) * 86_400_000);
  let list;
  try {
    list = await sicoobListPixReceived(from, to, '');
  } catch (err) {
    if (err instanceof SicoobNotConfiguredError) throw conflict(err.message);
    if (err instanceof SicoobApiError) {
      logger.warn('Pix: banco recusou a consulta', { status: err.status });
      throw badRequest(
        err.status === 401 || err.status === 403
          ? 'O Sicoob recusou a consulta de Pix. Habilite a API Pix (escopos cob.read e pix.read) no aplicativo do portal de desenvolvedores, ou importe o extrato.'
          : `O Sicoob não respondeu a consulta de Pix (${err.status || 'sem conexão'}). Tente de novo ou importe o extrato.`,
      );
    }
    throw err;
  }
  const result = await saveIncoming(
    list.map((p) => ({
      externalId: p.endToEndId,
      value: p.value,
      receivedAt: new Date(p.receivedAt),
      payerName: p.payerName,
      payerDocument: p.payerDocument,
      description: p.info,
      source: 'sicoob' as const,
    })),
  );
  return { fetched: list.length, withName: list.filter((p) => p.payerName).length, ...result };
}

// ─── Sugestões ──────────────────────────────────────────────────────────────

async function loadOpenTitles(): Promise<OpenTitle[]> {
  const rows = await prisma.financialTransaction.findMany({
    where: { type: 'receita', status: { in: ['pendente', 'atrasado'] }, orderId: { not: null } },
    orderBy: { dueDate: 'asc' },
    take: 1000,
    select: {
      id: true,
      value: true,
      dueDate: true,
      order: {
        select: {
          numero: true,
          status: true,
          customerId: true,
          customer: { select: { tradeName: true, legalName: true, cnpj: true, cpf: true, document: true } },
        },
      },
    },
  });
  const out: OpenTitle[] = [];
  for (const r of rows) {
    if (!r.order || r.order.status === 'cancelado') continue;
    const c = r.order.customer;
    out.push({
      transactionId: r.id,
      orderNumero: r.order.numero,
      customerId: r.order.customerId,
      customerLabel: c.tradeName,
      names: [c.tradeName, c.legalName].filter((x): x is string => !!x),
      docs: [c.cnpj, c.cpf, c.document].map((d) => (d ?? '').replace(/\D/g, '')).filter((d) => d.length === 11 || d.length === 14),
      value: num(r.value),
      dueDate: dateOnly(r.dueDate),
    });
  }
  return out;
}

export async function listPix(): Promise<PixListDTO> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const titles = await loadOpenTitles();
  const [pix, settled] = await Promise.all([
    prisma.pixReceived.findMany({ where: { status: 'novo', receivedAt: { gte: since } }, orderBy: { receivedAt: 'desc' }, take: 200 }),
    prisma.pixReceived.count({ where: { status: 'conciliado', settledAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const byId = new Map(titles.map((t) => [t.transactionId, t]));
  const rows: PixRowDTO[] = pix.map((p) => ({
    id: p.id,
    value: num(p.value),
    date: dateOnly(p.receivedAt)!,
    payerName: p.payerName,
    description: p.description,
    source: p.source,
    suggestions: suggestForPix({ value: num(p.value), payerName: p.payerName, payerDocument: p.payerDocument }, titles).map((s) => ({
      ...s,
      titles: s.transactionIds.flatMap((id) => {
        const t = byId.get(id);
        return t ? [{ transactionId: id, orderNumero: t.orderNumero, dueDate: t.dueDate, value: t.value }] : [];
      }),
    })),
  }));
  return { rows, recentlySettled: settled, bank: bankAvailability() };
}

// ─── Confirmar / ignorar ────────────────────────────────────────────────────

export interface PixConfirmResult {
  settled: number;
  boletosWrittenOff: number;
  warnings: string[];
}

export async function confirmPix(session: SessionPayload, pixId: string, transactionIds: string[]): Promise<PixConfirmResult> {
  const ids = [...new Set(transactionIds)];
  if (ids.length === 0) throw badRequest('Escolha o(s) título(s) para dar baixa.');

  const pix = await prisma.pixReceived.findUnique({ where: { id: pixId } });
  if (!pix) throw notFound('Pix');
  if (pix.status !== 'novo') throw conflict('Este Pix já foi tratado.');

  const txs = await prisma.financialTransaction.findMany({
    where: { id: { in: ids } },
    select: { id: true, value: true, type: true, status: true, orderId: true },
  });
  if (txs.length !== ids.length) throw notFound('Título');
  if (txs.some((t) => t.type !== 'receita' || !['pendente', 'atrasado'].includes(t.status))) {
    throw conflict('Algum dos títulos não está mais em aberto.');
  }
  const total = txs.reduce((s, t) => s + cents(num(t.value)), 0);
  if (total !== cents(num(pix.value))) {
    throw badRequest('O valor dos títulos escolhidos não é igual ao do Pix. Use o Financeiro para baixas parciais.');
  }

  // Reserva o Pix antes de baixar: dois cliques seguidos não baixam duas vezes.
  const claimed = await prisma.pixReceived.updateMany({
    where: { id: pixId, status: 'novo' },
    data: { status: 'conciliado', transactionId: ids[0], settledAt: new Date() },
  });
  if (claimed.count === 0) throw conflict('Este Pix já foi tratado.');

  const paymentDate = new Date(`${dateOnly(pix.receivedAt)}T12:00:00Z`);
  try {
    for (const id of ids) await settleTransaction(id, paymentDate);
  } catch (err) {
    await prisma.pixReceived.update({ where: { id: pixId }, data: { status: 'novo', transactionId: null, settledAt: null } });
    throw err;
  }

  // Boleto ainda registrado no banco para um pedido que já foi pago por Pix: baixa para não cobrar em duplicidade.
  const result: PixConfirmResult = { settled: ids.length, boletosWrittenOff: 0, warnings: [] };
  const orderIds = [...new Set(txs.map((t) => t.orderId).filter((x): x is string => !!x))];
  const boletos = orderIds.length
    ? await prisma.boleto.findMany({ where: { orderId: { in: orderIds }, status: 'registrado' }, select: { id: true, seuNumero: true } })
    : [];
  for (const b of boletos) {
    try {
      await writeOffBoleto(session, b.id);
      result.boletosWrittenOff += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Pix: não consegui baixar o boleto no banco', { seuNumero: b.seuNumero, message });
      result.warnings.push(`Boleto ${b.seuNumero} continua registrado no banco: ${message}`);
    }
  }
  return result;
}

export async function ignorePix(pixId: string): Promise<void> {
  const res = await prisma.pixReceived.updateMany({ where: { id: pixId, status: 'novo' }, data: { status: 'ignorado' } });
  if (res.count === 0) throw conflict('Este Pix já foi tratado.');
}
