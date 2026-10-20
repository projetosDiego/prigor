/**
 * Distribuição de um Pix entre títulos em aberto (baixa total, parcial ou com sobra).
 * Tudo em centavos para não acumular erro de ponto flutuante.
 */

export interface AllocTitle {
  id: string;
  cents: number;
  dueDate: string | null;
}

export interface Allocation {
  transactionId: string;
  cents: number;
  /** true = quita o título; false = baixa parcial (sobra saldo em aberto). */
  full: boolean;
}

export interface AllocationPlan {
  allocations: Allocation[];
  /** Pix que sobrou depois de quitar tudo (vira crédito do cliente). */
  leftoverCents: number;
  /** Total dos títulos que ficou sem cobertura. */
  uncoveredCents: number;
}

/** Paga primeiro os mais antigos (vencimento mais cedo); o último pode ficar parcial. */
export function allocateFifo(pixCents: number, titles: AllocTitle[]): AllocationPlan {
  const sorted = [...titles].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id));
  let left = Math.max(0, Math.round(pixCents));
  const allocations: Allocation[] = [];
  let uncovered = 0;
  for (const t of sorted) {
    if (left <= 0) {
      uncovered += t.cents;
      continue;
    }
    const pay = Math.min(left, t.cents);
    allocations.push({ transactionId: t.id, cents: pay, full: pay === t.cents });
    uncovered += t.cents - pay;
    left -= pay;
  }
  return { allocations, leftoverCents: left, uncoveredCents: uncovered };
}

export interface AllocationCheck {
  ok: boolean;
  error: string | null;
  totalCents: number;
  leftoverCents: number;
}

/** Valida a escolha manual: sem passar do saldo do título, sem passar do valor do Pix. */
export function checkAllocations(pixCents: number, titles: AllocTitle[], chosen: Array<{ transactionId: string; cents: number }>): AllocationCheck {
  const byId = new Map(titles.map((t) => [t.id, t]));
  let total = 0;
  const seen = new Set<string>();
  for (const c of chosen) {
    const t = byId.get(c.transactionId);
    if (!t) return { ok: false, error: 'Título não encontrado.', totalCents: total, leftoverCents: pixCents - total };
    if (seen.has(c.transactionId)) return { ok: false, error: 'Título repetido.', totalCents: total, leftoverCents: pixCents - total };
    seen.add(c.transactionId);
    if (!Number.isInteger(c.cents) || c.cents <= 0) return { ok: false, error: 'Valor inválido.', totalCents: total, leftoverCents: pixCents - total };
    if (c.cents > t.cents) return { ok: false, error: 'O valor passa do saldo do título.', totalCents: total, leftoverCents: pixCents - total };
    total += c.cents;
  }
  if (total > pixCents) return { ok: false, error: 'A soma passa do valor do Pix.', totalCents: total, leftoverCents: pixCents - total };
  return { ok: true, error: null, totalCents: total, leftoverCents: pixCents - total };
}
