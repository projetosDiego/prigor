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
import { checkAllocations } from '../domain/pix-allocation';
import { createCredit, settleAmount, writeOffBoletosOfSettledOrders } from './credits';
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
  /** Todos os títulos em aberto, para escolher cliente/título à mão. */
  openTitles: OpenTitle[];
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

/** Empresas (CNPJs) com Sicoob configurado: a principal ('') e as demais com prefixo próprio. */
async function bankScopes(): Promise<Array<{ scope: string; name: string; ready: boolean; missing: string[]; sandbox: boolean }>> {
  const issuers = await prisma.issuer.findMany({ where: { active: true }, select: { name: true, configPrefix: true }, orderBy: { name: 'asc' } });
  const list = [{ scope: '', name: 'Empresa principal' }];
  for (const i of issuers) {
    if (i.configPrefix && !list.some((l) => l.scope === i.configPrefix)) list.push({ scope: i.configPrefix, name: i.name });
  }
  return list.map((l) => {
    const st = integrationStatus(l.scope);
    return { ...l, ready: st.sicoob.ready, missing: st.sicoob.missing, sandbox: integrationEnv(l.scope).SICOOB_ENV === 'sandbox' };
  });
}

async function bankAvailability(): Promise<{ available: boolean; reason: string | null }> {
  const scopes = await bankScopes();
  const ready = scopes.filter((s) => s.ready);
  if (ready.length === 0) return { available: false, reason: `Integração Sicoob incompleta: falta ${scopes[0]!.missing.join(', ')}.` };
  const notes: string[] = [];
  if (ready.every((s) => s.sandbox)) notes.push('Ambiente de testes (sandbox) do Sicoob.');
  const off = scopes.filter((s) => !s.ready);
  if (off.length) notes.push(`Sem Sicoob configurado em: ${off.map((o) => o.name).join(', ')}.`);
  return { available: true, reason: notes.length ? notes.join(' ') : null };
}

export async function fetchFromBank(days = 7) {
  const scopes = (await bankScopes()).filter((s) => s.ready);
  if (scopes.length === 0) throw conflict((await bankAvailability()).reason ?? 'Sicoob não configurado.');
  const to = new Date();
  const from = new Date(to.getTime() - Math.min(Math.max(days, 1), 30) * 86_400_000);

  const total = { fetched: 0, withName: 0, imported: 0, duplicates: 0 };
  const perCompany: Array<{ name: string; fetched: number; imported: number; error: string | null }> = [];
  let lastError: unknown = null;
  for (const sc of scopes) {
    try {
      const list = await sicoobListPixReceived(from, to, sc.scope);
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
      total.fetched += list.length;
      total.withName += list.filter((p) => p.payerName).length;
      total.imported += result.imported;
      total.duplicates += result.duplicates;
      perCompany.push({ name: sc.name, fetched: list.length, imported: result.imported, error: null });
    } catch (err) {
      lastError = err;
      let message = err instanceof Error ? err.message : String(err);
      if (err instanceof SicoobApiError) {
        logger.warn('Pix: banco recusou a consulta', { status: err.status, empresa: sc.name });
        message =
          err.status === 401 || err.status === 403
            ? 'O Sicoob recusou a consulta de Pix. Habilite a API Pix (escopos cob.read e pix.read) no aplicativo do portal de desenvolvedores, ou importe o extrato.'
            : `O Sicoob não respondeu a consulta de Pix (${err.status || 'sem conexão'}).`;
      } else if (err instanceof SicoobNotConfiguredError) {
        message = err.message;
      }
      perCompany.push({ name: sc.name, fetched: 0, imported: 0, error: message });
    }
  }
  if (perCompany.every((c) => c.error) && lastError) {
    throw badRequest(`${perCompany.map((c) => `${c.name}: ${c.error}`).join(' | ')} Tente de novo ou importe o extrato.`);
  }
  return { ...total, perCompany };
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
  return { rows, recentlySettled: settled, openTitles: titles, bank: await bankAvailability() };
}

// ─── Confirmar / ignorar ────────────────────────────────────────────────────

export interface PixConfirmResult {
  settled: number;
  partial: number;
  creditCreated: number;
  boletosWrittenOff: number;
  warnings: string[];
}

export interface PixConfirmInput {
  /** Valor por título (em reais). Se vier só `transactionIds`, baixa cada um pelo valor cheio. */
  allocations?: Array<{ transactionId: string; amount: number }>;
  transactionIds?: string[];
  /** Cliente que fica com a sobra como crédito (se não der para deduzir pelos títulos). */
  customerId?: string;
}

export async function confirmPix(session: SessionPayload, pixId: string, input: PixConfirmInput): Promise<PixConfirmResult> {
  const pix = await prisma.pixReceived.findUnique({ where: { id: pixId } });
  if (!pix) throw notFound('Pix');
  if (pix.status !== 'novo') throw conflict('Este Pix já foi tratado.');
  const pixCents = cents(num(pix.value));

  const requested = input.allocations ?? (input.transactionIds ?? []).map((id) => ({ transactionId: id, amount: -1 }));
  const ids = [...new Set(requested.map((r) => r.transactionId))];
  if (ids.length !== requested.length) throw badRequest('Título repetido.');
  if (ids.length === 0 && !input.customerId) throw badRequest('Escolha o(s) título(s) ou o cliente que fica com o crédito.');

  const txs = ids.length
    ? await prisma.financialTransaction.findMany({
        where: { id: { in: ids } },
        select: { id: true, value: true, type: true, status: true, orderId: true, dueDate: true, order: { select: { customerId: true } } },
      })
    : [];
  if (txs.length !== ids.length) throw notFound('Título');
  if (txs.some((t) => t.type !== 'receita' || !['pendente', 'atrasado'].includes(t.status))) {
    throw conflict('Algum dos títulos não está mais em aberto.');
  }

  const chosen = requested.map((r) => {
    const t = txs.find((x) => x.id === r.transactionId)!;
    return { transactionId: r.transactionId, cents: r.amount < 0 ? cents(num(t.value)) : cents(r.amount) };
  });
  const check = checkAllocations(
    pixCents,
    txs.map((t) => ({ id: t.id, cents: cents(num(t.value)), dueDate: dateOnly(t.dueDate) })),
    chosen,
  );
  if (!check.ok) throw badRequest(check.error ?? 'Valores inválidos.');

  // Sobra do Pix vira crédito do cliente.
  const customers = new Set(txs.map((t) => t.order?.customerId).filter((x): x is string => !!x));
  const customerId = input.customerId ?? (customers.size === 1 ? [...customers][0]! : null);
  if (input.customerId && customers.size > 0 && !(customers.size === 1 && customers.has(input.customerId))) {
    throw badRequest('Os títulos escolhidos são de outro cliente.');
  }
  if (check.leftoverCents > 0 && !customerId) {
    throw badRequest('Sobrou valor do Pix e não há um cliente único para receber como crédito. Escolha o cliente.');
  }
  if (chosen.length === 0 && check.leftoverCents === 0) throw badRequest('Nada para baixar.');

  // Reserva o Pix antes de baixar: dois cliques seguidos não baixam duas vezes.
  const claimed = await prisma.pixReceived.updateMany({
    where: { id: pixId, status: 'novo' },
    data: { status: 'conciliado', transactionId: ids[0] ?? null, settledAt: new Date() },
  });
  if (claimed.count === 0) throw conflict('Este Pix já foi tratado.');

  const paymentDate = new Date(`${dateOnly(pix.receivedAt)}T12:00:00Z`);
  const result: PixConfirmResult = { settled: 0, partial: 0, creditCreated: 0, boletosWrittenOff: 0, warnings: [] };
  let done = 0;
  try {
    for (const c of chosen) {
      const r = await settleAmount(c.transactionId, c.cents, paymentDate);
      done += 1;
      if (r.partial) result.partial += 1;
      else result.settled += 1;
    }
  } catch (err) {
    if (done === 0) await prisma.pixReceived.update({ where: { id: pixId }, data: { status: 'novo', transactionId: null, settledAt: null } });
    else logger.warn('Pix: baixa interrompida no meio', { pixId, done });
    throw err;
  }

  if (check.leftoverCents > 0 && customerId) {
    await createCredit({
      customerId,
      amount: check.leftoverCents / 100,
      source: 'pix',
      note: `Sobra do Pix de ${pix.payerName ?? 'pagador não identificado'} (${dateOnly(pix.receivedAt)})`,
    });
    result.creditCreated = check.leftoverCents / 100;
  }

  const wo = await writeOffBoletosOfSettledOrders(session, txs.map((t) => t.orderId).filter((x): x is string => !!x));
  result.boletosWrittenOff = wo.count;
  result.warnings.push(...wo.warnings);
  return result;
}

export async function ignorePix(pixId: string): Promise<void> {
  const res = await prisma.pixReceived.updateMany({ where: { id: pixId, status: 'novo' }, data: { status: 'ignorado' } });
  if (res.count === 0) throw conflict('Este Pix já foi tratado.');
}
