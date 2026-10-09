/**
 * Cobrança: lista do que está a receber (com texto pronto para WhatsApp) e a
 * rotina diária — conferir boletos no banco, dar baixa nos pagos e mandar os
 * lembretes por e-mail na régua definida em `domain/collections`.
 */
import { prisma } from '../db';
import { logger } from '../http/logger';
import { bucketOf, daysLate, nextReminder, type CollectionBucket, type ReminderKind } from '../domain/collections';
import { orderDocsUrl } from './order-docs';
import { syncOpenBoletos, type BoletoSyncSummary } from './boletos';
import { sendMail } from './email';
import { dateOnly, num } from './serializers';

export interface CollectionRowDTO {
  transactionId: string;
  orderId: string;
  numero: number;
  customer: string;
  phone: string | null;
  email: string | null;
  seller: string | null;
  value: number;
  dueDate: string;
  /** Positivo = dias de atraso; negativo = dias para vencer. */
  daysLate: number;
  bucket: CollectionBucket;
  hasBoleto: boolean;
  /** Última etapa de lembrete por e-mail já enviada. */
  lastReminder: ReminderKind | null;
  link: string;
  whatsappText: string;
}

export interface CollectionsDTO {
  today: string;
  totals: { atrasado: number; hoje: number; proximo: number; futuro: number };
  rows: CollectionRowDTO[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');

/** Data civil de hoje em São Paulo (AAAA-MM-DD). */
export function todayBr(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function whatsappMessage(args: { customer: string; numero: number; value: number; dueDate: string; late: number; link: string }): string {
  const hello = `Olá, ${firstName(args.customer)}! Tudo bem? Aqui é da Doces Prigor.`;
  const body =
    args.late > 0
      ? `Consta em aberto o pedido ${args.numero}, no valor de ${brl(args.value)}, com vencimento em ${br(args.dueDate)} (${args.late} dia${args.late === 1 ? '' : 's'} de atraso).`
      : args.late === 0
        ? `Passando para lembrar que o pedido ${args.numero}, no valor de ${brl(args.value)}, vence hoje.`
        : `Passando para lembrar que o pedido ${args.numero}, no valor de ${brl(args.value)}, vence em ${br(args.dueDate)}.`;
  return `${hello} ${body}\n\nBoleto e nota fiscal aqui: ${args.link}\n\nSe já pagou, pode desconsiderar. Qualquer dúvida, é só me chamar!`;
}

export async function listCollections(today = todayBr()): Promise<CollectionsDTO> {
  const rows = await prisma.financialTransaction.findMany({
    where: { type: 'receita', status: { in: ['pendente', 'atrasado'] }, orderId: { not: null }, dueDate: { not: null } },
    orderBy: { dueDate: 'asc' },
    take: 500,
    select: {
      id: true,
      value: true,
      dueDate: true,
      order: {
        select: {
          id: true,
          numero: true,
          status: true,
          customer: { select: { tradeName: true, phone: true, mobile: true, email: true } },
          seller: { select: { name: true } },
          boletos: {
            where: { status: { in: ['registrado'] } },
            select: { id: true, reminders: { select: { kind: true } } },
          },
        },
      },
    },
  });

  const order: ReminderKind[] = ['antes2', 'vencimento', 'atraso3', 'atraso7'];
  const out: CollectionRowDTO[] = [];
  const totals = { atrasado: 0, hoje: 0, proximo: 0, futuro: 0 };

  for (const r of rows) {
    if (!r.order || r.order.status === 'cancelado' || !r.dueDate) continue;
    const dueIso = dateOnly(r.dueDate)!;
    const late = daysLate(dueIso, today);
    const bucket = bucketOf(late);
    const value = num(r.value);
    totals[bucket] += value;
    const link = orderDocsUrl(r.order.id);
    const sent = r.order.boletos.flatMap((b) => b.reminders.map((x) => x.kind as ReminderKind));
    const last = [...order].reverse().find((k) => sent.includes(k)) ?? null;
    const c = r.order.customer;
    out.push({
      transactionId: r.id,
      orderId: r.order.id,
      numero: r.order.numero,
      customer: c.tradeName,
      phone: (c.mobile || c.phone || '').replace(/\D/g, '') || null,
      email: c.email,
      seller: r.order.seller?.name ?? null,
      value,
      dueDate: dueIso,
      daysLate: late,
      bucket,
      hasBoleto: r.order.boletos.length > 0,
      lastReminder: last,
      link,
      whatsappText: whatsappMessage({ customer: c.tradeName, numero: r.order.numero, value, dueDate: dueIso, late, link }),
    });
  }
  return { today, totals, rows: out };
}

// ─── Rotina diária ───────────────────────────────────────────────────────────

const SUBJECT: Record<ReminderKind, (n: number) => string> = {
  antes2: (n) => `Lembrete: boleto do pedido ${n} vence em 2 dias`,
  vencimento: (n) => `Seu boleto do pedido ${n} vence hoje`,
  atraso3: (n) => `Boleto do pedido ${n} em aberto`,
  atraso7: (n) => `Pendência: boleto do pedido ${n} vencido`,
};

const INTRO: Record<ReminderKind, string> = {
  antes2: 'Passando para lembrar que o boleto abaixo vence em 2 dias.',
  vencimento: 'O boleto abaixo vence hoje.',
  atraso3: 'Não identificamos o pagamento do boleto abaixo, que venceu há alguns dias.',
  atraso7: 'O boleto abaixo está vencido há uma semana. Se houver qualquer problema, responda este e-mail que resolvemos juntos.',
};

function reminderHtml(args: { customer: string; numero: number; value: number; dueDate: string; kind: ReminderKind; link: string; linha: string | null; pix: string | null }): string {
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#78716c">${k}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1c1917">${v}</td></tr>`;
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f4;margin:0;padding:24px;color:#292524">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:14px;overflow:hidden">
<div style="background:#92400e;padding:18px 24px;color:#fff;font-weight:800;font-size:18px">Doces Prigor</div>
<div style="padding:24px">
<p style="margin:0 0 12px">Olá, ${firstName(args.customer)}!</p>
<p style="margin:0 0 16px">${INTRO[args.kind]}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;margin-bottom:16px">
${row('Pedido', String(args.numero))}${row('Valor', brl(args.value))}${row('Vencimento', br(args.dueDate))}
</table>
${args.linha ? `<p style="margin:0 0 4px;font-size:12px;color:#78716c">Linha digitável</p><p style="margin:0 0 16px;font-family:monospace;font-size:13px;word-break:break-all">${args.linha}</p>` : ''}
${args.pix ? `<p style="margin:0 0 4px;font-size:12px;color:#78716c">Pix copia e cola</p><p style="margin:0 0 16px;font-family:monospace;font-size:11px;word-break:break-all">${args.pix}</p>` : ''}
<p style="margin:0 0 20px"><a href="${args.link}" style="background:#d97706;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Abrir boleto e nota fiscal</a></p>
<p style="margin:0;font-size:12px;color:#a8a29e">Se você já pagou, desconsidere este aviso.</p>
</div></div></body></html>`;
}

export interface CollectionRunSummary {
  boletos: BoletoSyncSummary | { skipped: string };
  reminders: { sent: number; skippedNoEmail: number; failed: number };
}

export async function runCollections(options: { sendEmails?: boolean } = {}): Promise<CollectionRunSummary> {
  const sendEmails = options.sendEmails !== false;

  let boletos: CollectionRunSummary['boletos'];
  try {
    boletos = await syncOpenBoletos();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Cobrança: não consegui conferir boletos no banco', { message });
    boletos = { skipped: message };
  }

  const reminders = { sent: 0, skippedNoEmail: 0, failed: 0 };
  if (!sendEmails) return { boletos, reminders };

  const today = todayBr();
  const open = await prisma.boleto.findMany({
    where: { status: 'registrado' },
    take: 500,
    select: {
      id: true,
      value: true,
      dueDate: true,
      linhaDigitavel: true,
      pixCopiaECola: true,
      reminders: { select: { kind: true } },
      order: { select: { id: true, numero: true, status: true, customer: { select: { tradeName: true, email: true } } } },
    },
  });

  for (const b of open) {
    if (b.order.status === 'cancelado') continue;
    const dueIso = dateOnly(b.dueDate)!;
    const kind = nextReminder(daysLate(dueIso, today), new Set(b.reminders.map((r) => r.kind)));
    if (!kind) continue;
    const email = b.order.customer.email?.trim();
    if (!email) {
      reminders.skippedNoEmail += 1;
      continue;
    }
    const value = num(b.value);
    const result = await sendMail({
      to: email,
      subject: SUBJECT[kind](b.order.numero),
      html: reminderHtml({
        customer: b.order.customer.tradeName,
        numero: b.order.numero,
        value,
        dueDate: dueIso,
        kind,
        link: orderDocsUrl(b.order.id),
        linha: b.linhaDigitavel,
        pix: b.pixCopiaECola,
      }),
    });
    if (!result.success) {
      reminders.failed += 1;
      logger.warn('Cobrança: falha ao enviar lembrete', { boletoId: b.id, kind, error: result.error });
      continue;
    }
    await prisma.collectionReminder.create({ data: { boletoId: b.id, kind, toEmail: email } });
    reminders.sent += 1;
  }

  return { boletos, reminders };
}
