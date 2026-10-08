/**
 * Relatório por CNPJ: notas e boletos emitidos por empresa no período e
 * faturamento do ano frente ao limite (MEI).
 *
 * "Faturado no ano" = soma dos pedidos (não cancelados) atribuídos ao CNPJ,
 * pela data do pedido. Pedidos sem nota/boleto não têm CNPJ definido e
 * aparecem à parte, para a gerência saber que existem.
 */
import { prisma } from '../db';
import { limitStatus, sumBy, toCsv, yearProjection, type LimitLevel } from '../domain/issuer-report';
import { num } from './serializers';

export interface IssuerReportQuery {
  from: string; // AAAA-MM-DD
  to: string;
  issuerId?: string | null;
}

export interface IssuerReport {
  period: { from: string; to: string };
  year: number;
  issuers: {
    id: string;
    name: string;
    legalName: string;
    cnpj: string;
    annualLimit: number;
    invoices: { authorized: { count: number; total: number }; cancelled: { count: number; total: number } };
    boletos: {
      issued: { count: number; total: number };
      paid: { count: number; total: number };
      open: { count: number; total: number };
      overdue: { count: number; total: number };
      writtenOff: { count: number; total: number };
    };
    year: { invoiced: number; orders: number; projection: number; pct: number; level: LimitLevel; remaining: number };
  }[];
  /** Pedidos do ano sem CNPJ definido (nunca tiveram nota/boleto). */
  unassignedYear: { count: number; total: number };
  invoices: {
    id: string; issuerId: string | null; issuerName: string; date: string | null; number: number | null; series: number | null;
    status: string; orderNumero: number; customer: string; value: number; accessKey: string | null;
  }[];
  boletos: {
    id: string; issuerId: string | null; issuerName: string; issuedAt: string; dueDate: string; status: string;
    orderNumero: number; customer: string; value: number; paidAt: string | null; paidValue: number | null; nossoNumero: string | null;
  }[];
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const startOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

export async function issuerReport(q: IssuerReportQuery, today = new Date()): Promise<IssuerReport> {
  const from = startOf(q.from);
  const to = endOf(q.to);
  const year = today.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const issuerFilter = q.issuerId ? { issuerId: q.issuerId } : {};
  const todayIso = day(today)!;

  const [issuers, invoiceRows, boletoRows, yearOrders, yearInvoices] = await Promise.all([
    prisma.issuer.findMany({
      where: q.issuerId ? { id: q.issuerId } : {},
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    prisma.invoice.findMany({
      where: {
        ...issuerFilter,
        status: { in: ['autorizada', 'cancelada'] },
        OR: [{ authorizedAt: { gte: from, lte: to } }, { authorizedAt: null, createdAt: { gte: from, lte: to } }],
      },
      select: {
        id: true, issuerId: true, number: true, series: true, status: true, accessKey: true, authorizedAt: true, createdAt: true,
        order: { select: { numero: true, total: true, customer: { select: { tradeName: true } } } },
      },
      orderBy: [{ authorizedAt: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.boleto.findMany({
      where: { ...issuerFilter, status: { in: ['registrado', 'pago', 'baixado'] }, createdAt: { gte: from, lte: to } },
      select: {
        id: true, issuerId: true, status: true, value: true, dueDate: true, paidAt: true, paidValue: true, nossoNumero: true,
        createdAt: true, order: { select: { numero: true, customer: { select: { tradeName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.order.groupBy({
      by: ['issuerId'],
      where: { status: { not: 'cancelado' }, orderDate: { gte: yearStart, lte: yearEnd } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { ...issuerFilter, status: 'autorizada', authorizedAt: { gte: yearStart, lte: yearEnd } },
      select: { issuerId: true, order: { select: { total: true } } },
    }),
  ]);

  const names = new Map(issuers.map((i) => [i.id, i.name]));
  const invLines = invoiceRows.map((r) => ({
    id: r.id,
    issuerId: r.issuerId,
    issuerName: names.get(r.issuerId ?? '') ?? '—',
    date: day(r.authorizedAt ?? r.createdAt),
    number: r.number,
    series: r.series,
    status: r.status as string,
    orderNumero: r.order.numero,
    customer: r.order.customer?.tradeName ?? '',
    value: num(r.order.total),
    accessKey: r.accessKey,
  }));
  const bolLines = boletoRows.map((b) => ({
    id: b.id,
    issuerId: b.issuerId,
    issuerName: names.get(b.issuerId ?? '') ?? '—',
    issuedAt: day(b.createdAt)!,
    dueDate: day(b.dueDate)!,
    status: b.status as string,
    orderNumero: b.order.numero,
    customer: b.order.customer?.tradeName ?? '',
    value: num(b.value),
    paidAt: day(b.paidAt),
    paidValue: b.paidValue == null ? null : num(b.paidValue),
    nossoNumero: b.nossoNumero,
  }));
  const yearInv = yearInvoices.map((r) => ({ issuerId: r.issuerId, value: num(r.order.total) }));

  return {
    period: { from: q.from, to: q.to },
    year,
    issuers: issuers.map((i) => {
      const mine = <T extends { issuerId: string | null }>(r: T) => r.issuerId === i.id;
      const ordersYear = yearOrders.find((g) => g.issuerId === i.id);
      const ordersTotal = num(ordersYear?._sum.total ?? 0);
      const limit = num(i.annualLimit);
      const st = limitStatus(ordersTotal, limit);
      return {
        id: i.id,
        name: i.name,
        legalName: i.legalName,
        cnpj: i.cnpj,
        annualLimit: limit,
        invoices: {
          authorized: sumBy(invLines, (r) => mine(r) && r.status === 'autorizada'),
          cancelled: sumBy(invLines, (r) => mine(r) && r.status === 'cancelada'),
        },
        boletos: {
          issued: sumBy(bolLines, mine),
          paid: sumBy(bolLines, (r) => mine(r) && r.status === 'pago'),
          open: sumBy(bolLines, (r) => mine(r) && r.status === 'registrado'),
          overdue: sumBy(bolLines, (r) => mine(r) && r.status === 'registrado' && r.dueDate < todayIso),
          writtenOff: sumBy(bolLines, (r) => mine(r) && r.status === 'baixado'),
        },
        year: {
          invoiced: sumBy(yearInv, mine).total,
          orders: ordersTotal,
          projection: yearProjection(ordersTotal, today),
          ...st,
        },
      };
    }),
    unassignedYear: (() => {
      const g = yearOrders.find((x) => x.issuerId === null);
      return { count: g?._count._all ?? 0, total: num(g?._sum.total ?? 0) };
    })(),
    invoices: invLines,
    boletos: bolLines,
  };
}

const STATUS_LABEL: Record<string, string> = {
  autorizada: 'Autorizada', cancelada: 'Cancelada', registrado: 'Em aberto', pago: 'Pago', baixado: 'Baixado',
};
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Planilha (CSV) com todos os documentos do período, para o contador. */
export function issuerReportCsv(r: IssuerReport): string {
  const issuerCnpj = new Map(r.issuers.map((i) => [i.id, i.cnpj]));
  const rows: (string | number | null)[][] = [
    ...r.invoices.map((n) => [
      'NF-e', n.issuerName, issuerCnpj.get(n.issuerId ?? '') ?? '', br(n.date), n.number != null ? String(n.number) : '',
      n.series != null ? String(n.series) : '', n.orderNumero, n.customer, n.value, STATUS_LABEL[n.status] ?? n.status, '', '',
      n.accessKey ?? '',
    ]),
    ...r.boletos.map((b) => [
      'Boleto', b.issuerName, issuerCnpj.get(b.issuerId ?? '') ?? '', br(b.issuedAt), b.nossoNumero ?? '', '', b.orderNumero,
      b.customer, b.value, STATUS_LABEL[b.status] ?? b.status, br(b.dueDate), br(b.paidAt), '',
    ]),
  ];
  return toCsv(
    ['Tipo', 'Empresa', 'CNPJ', 'Data', 'Número', 'Série', 'Pedido', 'Cliente', 'Valor', 'Situação', 'Vencimento', 'Pagamento', 'Chave de acesso'],
    rows,
  );
}
