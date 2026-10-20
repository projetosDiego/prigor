/** Rentabilidade por cliente: quem compensa atender. */

export interface CustomerFacts {
  customerId: string;
  name: string;
  orders: number;
  /** Receita líquida (subtotal − desconto) dos pedidos. */
  revenue: number;
  /** Custo dos produtos vendidos. */
  cost: number;
  commission: number;
  /** Valor devolvido (devoluções) e custo perdido (trocas + devoluções). */
  returnedValue: number;
  returnLossCost: number;
  unitsSold: number;
  unitsReturned: number;
  /** Atraso médio (dias) dos títulos pagos com atraso; 0 se em dia. */
  avgDelayDays: number;
  overdueOpen: number;
  lastOrderDate: string | null;
}

export type Verdict = 'ok' | 'atencao' | 'nao_compensa';

export interface CustomerProfit extends CustomerFacts {
  netRevenue: number;
  profit: number;
  marginPct: number | null;
  returnRatePct: number;
  verdict: Verdict;
  reasons: string[];
}

export interface Thresholds {
  minMarginPct: number;
  warnMarginPct: number;
  warnReturnPct: number;
  warnDelayDays: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { minMarginPct: 8, warnMarginPct: 20, warnReturnPct: 8, warnDelayDays: 10 };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateCustomer(f: CustomerFacts, t: Thresholds = DEFAULT_THRESHOLDS): CustomerProfit {
  const netRevenue = r2(f.revenue - f.returnedValue);
  const profit = r2(netRevenue - f.cost - f.commission - f.returnLossCost);
  const marginPct = netRevenue > 0 ? Math.round((profit / netRevenue) * 1000) / 10 : null;
  const returnRatePct = f.unitsSold > 0 ? Math.round((f.unitsReturned / f.unitsSold) * 1000) / 10 : 0;

  const reasons: string[] = [];
  let verdict: Verdict = 'ok';
  const bump = (v: Verdict) => {
    if (v === 'nao_compensa' || (v === 'atencao' && verdict === 'ok')) verdict = v;
  };

  if (f.orders > 0) {
    if (profit <= 0) {
      bump('nao_compensa');
      reasons.push('Lucro zerado ou negativo');
    } else if (marginPct !== null && marginPct < t.minMarginPct) {
      bump('nao_compensa');
      reasons.push(`Margem de ${marginPct}% (mínimo ${t.minMarginPct}%)`);
    } else if (marginPct !== null && marginPct < t.warnMarginPct) {
      bump('atencao');
      reasons.push(`Margem baixa: ${marginPct}%`);
    }
    if (returnRatePct >= t.warnReturnPct) {
      bump(returnRatePct >= t.warnReturnPct * 2 ? 'nao_compensa' : 'atencao');
      reasons.push(`${returnRatePct}% das unidades voltam em troca/devolução`);
    }
    if (f.avgDelayDays >= t.warnDelayDays) {
      bump('atencao');
      reasons.push(`Paga com ${Math.round(f.avgDelayDays)} dias de atraso em média`);
    }
    if (f.overdueOpen > 0 && f.overdueOpen > f.revenue * 0.3) {
      bump('atencao');
      reasons.push('Muito valor vencido em aberto');
    }
  }

  return { ...f, netRevenue, profit, marginPct, returnRatePct, verdict, reasons };
}

const ORDER: Record<Verdict, number> = { nao_compensa: 0, atencao: 1, ok: 2 };

export function rankCustomers(list: CustomerProfit[]): CustomerProfit[] {
  return [...list].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || a.profit - b.profit);
}
