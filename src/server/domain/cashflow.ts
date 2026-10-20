/** Fluxo de caixa projetado, parcelamento e vencimentos — tudo em centavos e datas civis (AAAA-MM-DD). */

export interface FlowItem {
  /** Vencimento. */
  date: string;
  cents: number;
  type: 'receita' | 'despesa';
}

export interface FlowBucket {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  inCents: number;
  outCents: number;
  netCents: number;
  /** Saldo no fim do período, sem contar recebimentos que já estão atrasados. */
  balanceCents: number;
  /** Saldo no fim do período se os atrasados também forem recebidos. */
  optimisticCents: number;
}

export interface Cashflow {
  buckets: FlowBucket[];
  minBalanceCents: number;
  /** Primeiro período em que o saldo (conservador) fica negativo. */
  firstNegative: string | null;
  laterInCents: number;
  laterOutCents: number;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekLabel(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function projectCashflow(opts: { startCents: number; today: string; weeks: number; items: FlowItem[] }): Cashflow {
  const { today, weeks } = opts;
  const buckets: FlowBucket[] = [];
  const mk = (key: string, label: string, from: string | null, to: string | null): FlowBucket => ({
    key, label, from, to, inCents: 0, outCents: 0, netCents: 0, balanceCents: 0, optimisticCents: 0,
  });
  const overdue = mk('overdue', 'Atrasados', null, addDays(today, -1));
  buckets.push(overdue);
  for (let w = 0; w < weeks; w++) {
    const from = addDays(today, w * 7);
    const to = addDays(today, w * 7 + 6);
    buckets.push(mk(`w${w}`, w === 0 ? `Esta semana (${dayOfWeekLabel(from)}–${dayOfWeekLabel(to)})` : `${dayOfWeekLabel(from)}–${dayOfWeekLabel(to)}`, from, to));
  }
  const horizonEnd = addDays(today, weeks * 7 - 1);
  let laterIn = 0;
  let laterOut = 0;
  let overdueIn = 0;

  for (const it of opts.items) {
    if (it.date < today) {
      if (it.type === 'receita') {
        overdue.inCents += it.cents;
        overdueIn += it.cents;
      } else overdue.outCents += it.cents;
      continue;
    }
    if (it.date > horizonEnd) {
      if (it.type === 'receita') laterIn += it.cents;
      else laterOut += it.cents;
      continue;
    }
    const idx = Math.floor(daysBetween(today, it.date) / 7) + 1;
    const b = buckets[idx]!;
    if (it.type === 'receita') b.inCents += it.cents;
    else b.outCents += it.cents;
  }

  let cons = opts.startCents;
  let opt = opts.startCents;
  let min = opts.startCents;
  let firstNegative: string | null = null;
  for (const b of buckets) {
    b.netCents = b.inCents - b.outCents;
    if (b.key === 'overdue') {
      cons += -b.outCents; // atrasado a receber não entra no conservador
      opt += b.netCents;
    } else {
      cons += b.netCents;
      opt += b.netCents;
    }
    b.balanceCents = cons;
    b.optimisticCents = opt;
    if (cons < min) min = cons;
    if (cons < 0 && !firstNegative) firstNegative = b.label;
  }
  void overdueIn;
  return { buckets, minBalanceCents: min, firstNegative, laterInCents: laterIn, laterOutCents: laterOut };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Soma `k` meses mantendo o dia (ou o último dia do mês quando não existe). */
export function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = (m - 1) + k;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export interface Installment {
  number: number;
  cents: number;
  dueDate: string;
}

/** Divide o total em parcelas mensais; a sobra de centavos vai na primeira. */
export function splitInstallments(totalCents: number, n: number, firstDue: string): Installment[] {
  const count = Math.max(1, Math.min(60, Math.round(n)));
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    cents: base + (i === 0 ? rest : 0),
    dueDate: addMonths(firstDue, i),
  }));
}

/** Vencimento do mês `month` (AAAA-MM) para um dia fixo, limitado ao último dia. */
export function dueInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(day, 1), last)).padStart(2, '0')}`;
}

/** Categorias de despesa sugeridas. `estoque` = compras que já entram no custo dos produtos vendidos. */
export const EXPENSE_CATEGORIES: Array<{ name: string; group: 'estoque' | 'operacional' | 'pessoal' | 'impostos' | 'investimento' }> = [
  { name: 'Ingredientes', group: 'estoque' },
  { name: 'Embalagens', group: 'estoque' },
  { name: 'Salários e pró-labore', group: 'pessoal' },
  { name: 'Comissões de Vendas', group: 'pessoal' },
  { name: 'Aluguel', group: 'operacional' },
  { name: 'Energia, água e gás', group: 'operacional' },
  { name: 'Internet e telefone', group: 'operacional' },
  { name: 'Combustível e entregas', group: 'operacional' },
  { name: 'Marketing', group: 'operacional' },
  { name: 'Manutenção', group: 'operacional' },
  { name: 'Impostos e taxas', group: 'impostos' },
  { name: 'Tarifas bancárias', group: 'operacional' },
  { name: 'Equipamentos', group: 'investimento' },
  { name: 'Outros', group: 'operacional' },
];

export function categoryGroup(name: string | null): 'estoque' | 'operacional' | 'pessoal' | 'impostos' | 'investimento' {
  return EXPENSE_CATEGORIES.find((c) => c.name.toLowerCase() === (name ?? '').toLowerCase())?.group ?? 'operacional';
}
