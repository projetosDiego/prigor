/**
 * Relatório do supervisor para PAGAMENTO.
 *
 * Fecha um mês por supervisor: o que cada vendedor da equipe vendeu, quantos
 * clientes atendeu, a comissão de supervisão devida, e o que o próprio
 * supervisor tem a receber (comissão própria + ajuda de custo - adiantamentos).
 * Traz também a evolução dos últimos meses da equipe, para ver se a equipe
 * cresceu ou regrediu.
 *
 * Os números do mês vêm de `sellerReport`, a mesma fonte do relatório por
 * vendedor: o valor a pagar aqui é sempre igual ao do fechamento individual.
 */
import { prisma } from '../db';
import { num } from './serializers';
import { sellerReport } from './reports';

export type Trend = 'up' | 'down' | 'flat' | 'new';

export interface SupervisorSubordinateRow {
  sellerId: string;
  sellerName: string;
  orders: number;
  /** Clientes distintos atendidos no mês. */
  customers: number;
  sales: number;
  supervisorPct: number;
  supervisorCommission: number;
}

export interface SupervisorMonthPoint {
  year: number;
  month: number;
  label: string;
  sales: number;
  orders: number;
  customers: number;
  commission: number;
  /** Variação das vendas da equipe sobre o mês anterior (%). */
  changePct: number | null;
  trend: Trend;
}

export interface SupervisorPaymentReport {
  supervisorId: string;
  supervisorName: string;
  subordinates: SupervisorSubordinateRow[];
  team: { sales: number; orders: number; customers: number; commission: number };
  payment: {
    supervisionCommission: number;
    ownCommission: number;
    allowance: number;
    advances: number;
    net: number;
  };
  history: SupervisorMonthPoint[];
  verdict: { trend: Trend; changePct: number | null; previousSales: number; text: string };
}

export interface SupervisorsReportDTO {
  period: { year: number; month: number; from: string; to: string };
  supervisors: SupervisorPaymentReport[];
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const HISTORY_MONTHS = 6;
/** Variação abaixo disso (em módulo) é considerada estável. */
const FLAT_THRESHOLD_PCT = 2;

const round2 = (n: number) => Math.round(n * 100) / 100;

function trendOf(current: number, previous: number): { trend: Trend; changePct: number | null } {
  if (previous <= 0) return { trend: current > 0 ? 'new' : 'flat', changePct: null };
  const changePct = ((current - previous) / previous) * 100;
  if (Math.abs(changePct) < FLAT_THRESHOLD_PCT) return { trend: 'flat', changePct };
  return { trend: changePct > 0 ? 'up' : 'down', changePct };
}

function pctText(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function verdictText(trend: Trend, changePct: number | null, prevLabel: string): string {
  if (trend === 'new') return `Sem vendas em ${prevLabel}: a equipe voltou a vender neste mês.`;
  if (trend === 'flat' && changePct === null) return 'Sem vendas da equipe no período.';
  if (changePct === null) return 'Sem base de comparação.';
  if (trend === 'flat') return `Estável: ${changePct >= 0 ? '+' : '-'}${pctText(Math.abs(changePct))}% sobre ${prevLabel}.`;
  if (trend === 'up') return `Crescimento de ${pctText(changePct)}% sobre ${prevLabel}.`;
  return `Queda de ${pctText(Math.abs(changePct))}% sobre ${prevLabel}.`;
}

function monthKey(y: number, m: number): string {
  return `${y}-${m}`;
}

/** Soma `delta` meses a (year, month), devolvendo ano/mês normalizados. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export async function supervisorsReport(year: number, month: number): Promise<SupervisorsReportDTO> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));

  const [report, links] = await Promise.all([
    sellerReport(from, lastDay),
    prisma.seller.findMany({
      where: { active: true, supervisorId: { not: null } },
      select: { id: true, supervisorId: true, supervisorCommissionPct: true },
    }),
  ]);

  const rowById = new Map(report.rows.map((r) => [r.sellerId, r]));
  const supervisors = report.rows.filter((r) => r.subordinatesCount > 0);

  const pctBySub = new Map<string, number>();
  const subsBySupervisor = new Map<string, string[]>();
  for (const l of links) {
    if (!l.supervisorId) continue;
    pctBySub.set(l.id, num(l.supervisorCommissionPct));
    const list = subsBySupervisor.get(l.supervisorId) ?? [];
    list.push(l.id);
    subsBySupervisor.set(l.supervisorId, list);
  }

  // Histórico: HISTORY_MONTHS meses até o selecionado + 1 de base para a variação do primeiro.
  const first = shiftMonth(year, month, -HISTORY_MONTHS);
  const windowStart = new Date(Date.UTC(first.year, first.month - 1, 1));
  const windowEnd = new Date(Date.UTC(year, month, 1));
  const allSubIds = [...pctBySub.keys()];

  const histOrders = allSubIds.length
    ? await prisma.order.findMany({
        where: {
          status: { not: 'cancelado' },
          sellerId: { in: allSubIds },
          orderDate: { gte: windowStart, lt: windowEnd },
        },
        select: { sellerId: true, customerId: true, orderDate: true, total: true },
      })
    : [];

  const result: SupervisorPaymentReport[] = supervisors
    .map((sup) => {
      const subIds = subsBySupervisor.get(sup.sellerId) ?? [];

      const subordinates: SupervisorSubordinateRow[] = subIds
        .map((id) => {
          const row = rowById.get(id);
          const pct = pctBySub.get(id) ?? 0;
          const sales = row?.realized ?? 0;
          return {
            sellerId: id,
            sellerName: row?.sellerName ?? '—',
            orders: row?.orders ?? 0,
            customers: row?.customers.length ?? 0,
            sales: round2(sales),
            supervisorPct: pct,
            supervisorCommission: round2((sales * pct) / 100),
          };
        })
        .sort((a, b) => b.sales - a.sales);

      // Clientes distintos da equipe no mês (um cliente atendido por 2 vendedores conta 1).
      const teamCustomers = new Set<string>();
      for (const id of subIds) {
        for (const c of rowById.get(id)?.customers ?? []) teamCustomers.add(c.customerId);
      }

      const team = {
        sales: round2(subordinates.reduce((s, r) => s + r.sales, 0)),
        orders: subordinates.reduce((s, r) => s + r.orders, 0),
        customers: teamCustomers.size,
        commission: round2(subordinates.reduce((s, r) => s + r.supervisorCommission, 0)),
      };

      // Evolução mês a mês da equipe.
      const subSet = new Set(subIds);
      const buckets = new Map<string, { sales: number; orders: number; customers: Set<string>; commission: number }>();
      for (const o of histOrders) {
        if (!o.sellerId || !subSet.has(o.sellerId)) continue;
        const key = monthKey(o.orderDate.getUTCFullYear(), o.orderDate.getUTCMonth() + 1);
        let b = buckets.get(key);
        if (!b) {
          b = { sales: 0, orders: 0, customers: new Set(), commission: 0 };
          buckets.set(key, b);
        }
        const total = num(o.total);
        b.sales += total;
        b.orders += 1;
        b.customers.add(o.customerId);
        b.commission += (total * (pctBySub.get(o.sellerId) ?? 0)) / 100;
      }

      const history: SupervisorMonthPoint[] = [];
      for (let i = -HISTORY_MONTHS + 1; i <= 0; i++) {
        const cur = shiftMonth(year, month, i);
        const prev = shiftMonth(year, month, i - 1);
        const b = buckets.get(monthKey(cur.year, cur.month));
        const pb = buckets.get(monthKey(prev.year, prev.month));
        const sales = round2(b?.sales ?? 0);
        const { trend, changePct } = trendOf(sales, pb?.sales ?? 0);
        history.push({
          year: cur.year,
          month: cur.month,
          label: `${MESES[cur.month - 1].slice(0, 3)}/${String(cur.year).slice(2)}`,
          sales,
          orders: b?.orders ?? 0,
          customers: b?.customers.size ?? 0,
          commission: round2(b?.commission ?? 0),
          changePct,
          trend,
        });
      }

      const current = history[history.length - 1];
      const prevMonth = shiftMonth(year, month, -1);
      const prevLabel = `${MESES[prevMonth.month - 1]}/${prevMonth.year}`;
      const previousSales = round2(buckets.get(monthKey(prevMonth.year, prevMonth.month))?.sales ?? 0);

      return {
        supervisorId: sup.sellerId,
        supervisorName: sup.sellerName,
        subordinates,
        team,
        payment: {
          supervisionCommission: round2(sup.supervisorCommission),
          ownCommission: round2(sup.commission),
          allowance: round2(sup.allowance),
          advances: round2(sup.advancesTotal),
          net: round2(sup.netCommission),
        },
        history,
        verdict: {
          trend: current.trend,
          changePct: current.changePct,
          previousSales,
          text: verdictText(current.trend, current.changePct, prevLabel),
        },
      };
    })
    .sort((a, b) => a.supervisorName.localeCompare(b.supervisorName, 'pt-BR'));

  return {
    period: { year, month, from: report.period.from, to: report.period.to },
    supervisors: result,
  };
}
