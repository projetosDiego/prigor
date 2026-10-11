/**
 * Projeção de vendas do mês (pura, sem banco).
 *
 *  - ritmo do mês: realizado ÷ dias decorridos;
 *  - ritmo recente: média dos últimos `window` dias (pega tendência de alta/queda);
 *  - projeção = realizado + ritmo × dias que faltam (o dia de hoje conta como decorrido).
 */

export interface ProjectionInput {
  /** Total vendido por dia do mês (1..31). Dias sem venda podem faltar. */
  dailyTotals: Map<number, number>;
  /** Dia do mês de hoje (1..31). */
  today: number;
  daysInMonth: number;
  /** Meta de faturamento do mês; 0 = sem meta. */
  goal: number;
  /** Janela, em dias, do ritmo recente. */
  window?: number;
}

export interface ProjectionResult {
  realized: number;
  daysElapsed: number;
  daysLeft: number;
  paceMonth: number;
  paceRecent: number;
  projectionMonth: number;
  projectionRecent: number;
  /** Meta que falta vender (>= 0); 0 quando não há meta. */
  missing: number;
  /** Quanto precisa vender por dia nos dias restantes para bater a meta; 0 sem meta ou meta batida. */
  neededPerDay: number;
  /** Projeção (ritmo do mês) ÷ meta, em %. 0 sem meta. */
  projectedPctGoal: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function projectMonth(input: ProjectionInput): ProjectionResult {
  const window = Math.max(1, input.window ?? 14);
  const today = Math.min(Math.max(1, Math.floor(input.today)), input.daysInMonth);
  const daysLeft = Math.max(0, input.daysInMonth - today);

  let realized = 0;
  for (const [day, v] of input.dailyTotals) if (day <= today) realized += v;

  const paceMonth = realized / today;

  const first = Math.max(1, today - window + 1);
  let recent = 0;
  for (let d = first; d <= today; d++) recent += input.dailyTotals.get(d) ?? 0;
  const paceRecent = recent / (today - first + 1);

  const goal = Math.max(0, input.goal);
  const missing = goal > 0 ? Math.max(0, goal - realized) : 0;
  const projectionMonth = realized + paceMonth * daysLeft;

  return {
    realized: round2(realized),
    daysElapsed: today,
    daysLeft,
    paceMonth: round2(paceMonth),
    paceRecent: round2(paceRecent),
    projectionMonth: round2(projectionMonth),
    projectionRecent: round2(realized + paceRecent * daysLeft),
    missing: round2(missing),
    neededPerDay: daysLeft > 0 ? round2(missing / daysLeft) : 0,
    projectedPctGoal: goal > 0 ? round2((projectionMonth / goal) * 100) : 0,
  };
}
