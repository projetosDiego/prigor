/** Troca/devolução parcial: converte unidades-base em fração do item e valores. */

export interface ReturnInput {
  /** Unidades-base devolvidas (ex.: 2 brownies). */
  units: number;
  /** Unidades-base por item vendido (display com 12 → 12; produto simples → 1). */
  unitsPerItem: number;
  /** Quantidade do item no pedido. */
  itemQuantity: number;
  /** Preço unitário do item (já líquido do desconto do item, por unidade do item). */
  itemNetUnitPrice: number;
  /** Custo unitário do item. */
  itemUnitCost: number;
  /** Unidades-base já devolvidas/trocadas nesse item. */
  alreadyReturnedUnits: number;
}

export interface ReturnComputation {
  itemQty: number;
  value: number;
  cost: number;
  maxUnits: number;
  remainingUnits: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeReturn(i: ReturnInput): ReturnComputation {
  const per = i.unitsPerItem > 0 ? i.unitsPerItem : 1;
  const maxUnits = i.itemQuantity * per;
  const remainingUnits = Math.max(0, maxUnits - i.alreadyReturnedUnits);
  if (!(i.units > 0)) throw new Error('Informe quantas unidades.');
  if (i.units > remainingUnits + 1e-9) {
    throw new Error(`Só restam ${Math.round(remainingUnits * 1000) / 1000} unidade(s) neste item para devolver.`);
  }
  const itemQty = i.units / per;
  return {
    itemQty: Math.round(itemQty * 10000) / 10000,
    value: r2(itemQty * i.itemNetUnitPrice),
    cost: r2(itemQty * i.itemUnitCost),
    maxUnits,
    remainingUnits,
  };
}

export interface MonthReturnRow {
  createdAt: string; // AAAA-MM-DD
  kind: 'troca' | 'devolucao';
  units: number;
  value: number;
  cost: number;
}

export interface MonthTotals {
  month: string;
  trocas: number;
  devolucoes: number;
  units: number;
  /** Prejuízo estimado: custo perdido nas trocas + valor devolvido (+ custo, que não volta). */
  lossValue: number;
}

export function monthTotals(rows: MonthReturnRow[]): MonthTotals[] {
  const map = new Map<string, MonthTotals>();
  for (const r of rows) {
    const month = r.createdAt.slice(0, 7);
    const t = map.get(month) ?? { month, trocas: 0, devolucoes: 0, units: 0, lossValue: 0 };
    if (r.kind === 'troca') {
      t.trocas += 1;
      t.lossValue += r.cost;
    } else {
      t.devolucoes += 1;
      t.lossValue += r.value + r.cost;
    }
    t.units += r.units;
    map.set(month, t);
  }
  return [...map.values()]
    .map((t) => ({ ...t, lossValue: r2(t.lossValue) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
