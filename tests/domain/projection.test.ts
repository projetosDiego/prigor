import { describe, expect, it } from 'vitest';

import { projectMonth } from '@/server/domain/projection';

describe('projectMonth', () => {
  it('projeta pelo ritmo do mês e calcula quanto falta por dia', () => {
    // dia 10 de 30, vendeu R$ 1.000 no total
    const daily = new Map<number, number>([
      [2, 400],
      [5, 300],
      [9, 300],
    ]);
    const r = projectMonth({ dailyTotals: daily, today: 10, daysInMonth: 30, goal: 5000 });
    expect(r.realized).toBe(1000);
    expect(r.paceMonth).toBe(100);
    expect(r.projectionMonth).toBe(3000);
    expect(r.daysLeft).toBe(20);
    expect(r.missing).toBe(4000);
    expect(r.neededPerDay).toBe(200);
    expect(r.projectedPctGoal).toBe(60);
  });

  it('ritmo recente enxerga aceleração', () => {
    const daily = new Map<number, number>();
    daily.set(1, 100);
    for (let d = 17; d <= 20; d++) daily.set(d, 500);
    const r = projectMonth({ dailyTotals: daily, today: 20, daysInMonth: 30, goal: 0, window: 7 });
    expect(r.realized).toBe(2100);
    expect(r.paceRecent).toBe(Math.round((2000 / 7) * 100) / 100);
    expect(r.projectionRecent).toBeGreaterThan(r.projectionMonth);
    expect(r.missing).toBe(0);
    expect(r.projectedPctGoal).toBe(0);
  });

  it('último dia do mês: projeção = realizado; meta batida não pede ritmo', () => {
    const r = projectMonth({ dailyTotals: new Map([[3, 900]]), today: 31, daysInMonth: 31, goal: 800 });
    expect(r.projectionMonth).toBe(900);
    expect(r.neededPerDay).toBe(0);
    expect(r.missing).toBe(0);
  });

  it('ignora vendas de dias futuros e protege dia inválido', () => {
    const r = projectMonth({ dailyTotals: new Map([[5, 100], [25, 999]]), today: 0, daysInMonth: 30, goal: 0 });
    expect(r.daysElapsed).toBe(1);
    expect(r.realized).toBe(0);
  });
});
