/**
 * Régua de cobrança (pura): decide qual lembrete enviar para um boleto em
 * aberto, a partir de quantos dias ele está vencido.
 *
 *   −2 dias  → antes2      (aviso antes do vencimento)
 *    0       → vencimento  (vence hoje)
 *   +3 dias  → atraso3
 *   +7 dias  → atraso7
 *
 * A rotina roda uma vez por dia; se um dia falhar, a etapa ainda é enviada
 * até `CATCH_UP_DAYS` depois. Etapas já enviadas nunca se repetem, e uma
 * etapa antiga não é enviada quando já existe uma mais nova elegível.
 */

export type ReminderKind = 'antes2' | 'vencimento' | 'atraso3' | 'atraso7';

export const REMINDER_STEPS: ReadonlyArray<{ kind: ReminderKind; daysLate: number }> = [
  { kind: 'antes2', daysLate: -2 },
  { kind: 'vencimento', daysLate: 0 },
  { kind: 'atraso3', daysLate: 3 },
  { kind: 'atraso7', daysLate: 7 },
];

export const CATCH_UP_DAYS = 2;

/** Dias de atraso (positivo = vencido) entre duas datas civis AAAA-MM-DD. */
export function daysLate(dueIso: string, todayIso: string): number {
  const d = Date.UTC(+dueIso.slice(0, 4), +dueIso.slice(5, 7) - 1, +dueIso.slice(8, 10));
  const t = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  return Math.round((t - d) / 86_400_000);
}

export function nextReminder(late: number, alreadySent: ReadonlySet<string>): ReminderKind | null {
  // Etapa mais avançada já alcançada.
  let current: (typeof REMINDER_STEPS)[number] | null = null;
  for (const step of REMINDER_STEPS) if (late >= step.daysLate) current = step;
  if (!current) return null;
  if (late - current.daysLate > CATCH_UP_DAYS) return null;
  return alreadySent.has(current.kind) ? null : current.kind;
}

export type CollectionBucket = 'atrasado' | 'hoje' | 'proximo' | 'futuro';

export function bucketOf(late: number): CollectionBucket {
  if (late > 0) return 'atrasado';
  if (late === 0) return 'hoje';
  return late >= -7 ? 'proximo' : 'futuro';
}
