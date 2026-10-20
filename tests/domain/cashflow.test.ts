import { describe, expect, it } from 'vitest';
import { addMonths, categoryGroup, dueInMonth, projectCashflow, splitInstallments } from '@/server/domain/cashflow';

describe('splitInstallments', () => {
  it('divide e põe a sobra na primeira', () => {
    const p = splitInstallments(10000, 3, '2026-10-31');
    expect(p.map((x) => x.cents)).toEqual([3334, 3333, 3333]);
    expect(p.reduce((s, x) => s + x.cents, 0)).toBe(10000);
    expect(p.map((x) => x.dueDate)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
});

describe('datas', () => {
  it('addMonths vira o ano e respeita fevereiro', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
  });
  it('dueInMonth limita ao último dia', () => expect(dueInMonth('2027-02', 31)).toBe('2027-02-28'));
});

describe('projectCashflow', () => {
  const today = '2026-10-20';
  it('agrupa por semana e acumula o saldo', () => {
    const f = projectCashflow({
      startCents: 100000,
      today,
      weeks: 3,
      items: [
        { date: '2026-10-22', cents: 50000, type: 'receita' },
        { date: '2026-10-28', cents: 200000, type: 'despesa' },
        { date: '2026-12-01', cents: 1000, type: 'receita' },
      ],
    });
    expect(f.buckets[1]!.inCents).toBe(50000);
    expect(f.buckets[2]!.outCents).toBe(200000);
    expect(f.buckets[2]!.balanceCents).toBe(-50000);
    expect(f.firstNegative).toMatch(/27\/10/);
    expect(f.laterInCents).toBe(1000);
  });
  it('recebimento atrasado só entra no saldo otimista', () => {
    const f = projectCashflow({ startCents: 0, today, weeks: 1, items: [{ date: '2026-10-01', cents: 5000, type: 'receita' }] });
    expect(f.buckets[0]!.inCents).toBe(5000);
    expect(f.buckets[1]!.balanceCents).toBe(0);
    expect(f.buckets[1]!.optimisticCents).toBe(5000);
  });
  it('despesa atrasada pesa no saldo conservador', () => {
    const f = projectCashflow({ startCents: 1000, today, weeks: 1, items: [{ date: '2026-10-10', cents: 3000, type: 'despesa' }] });
    expect(f.buckets[1]!.balanceCents).toBe(-2000);
  });
});

describe('categoryGroup', () => {
  it('estoque e padrão', () => {
    expect(categoryGroup('ingredientes')).toBe('estoque');
    expect(categoryGroup('coisa nova')).toBe('operacional');
  });
});
