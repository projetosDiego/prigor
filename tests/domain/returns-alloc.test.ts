import { describe, expect, it } from 'vitest';
import { allocateFifo, checkAllocations } from '@/server/domain/pix-allocation';
import { computeReturn, monthTotals } from '@/server/domain/returns';
import { evaluateCustomer, rankCustomers, type CustomerFacts } from '@/server/domain/customer-profit';

describe('allocateFifo', () => {
  const titles = [
    { id: 'b', cents: 10000, dueDate: '2026-10-20' },
    { id: 'a', cents: 5000, dueDate: '2026-10-05' },
  ];
  it('paga o mais antigo primeiro e deixa o último parcial', () => {
    const p = allocateFifo(8000, titles);
    expect(p.allocations).toEqual([
      { transactionId: 'a', cents: 5000, full: true },
      { transactionId: 'b', cents: 3000, full: false },
    ]);
    expect(p.leftoverCents).toBe(0);
    expect(p.uncoveredCents).toBe(7000);
  });
  it('sobra vira leftover', () => {
    const p = allocateFifo(20000, titles);
    expect(p.leftoverCents).toBe(5000);
    expect(p.uncoveredCents).toBe(0);
  });
});

describe('checkAllocations', () => {
  const titles = [{ id: 'a', cents: 5000, dueDate: null }];
  it('aceita parcial', () => expect(checkAllocations(3000, titles, [{ transactionId: 'a', cents: 3000 }]).ok).toBe(true));
  it('recusa passar do saldo', () => expect(checkAllocations(9000, titles, [{ transactionId: 'a', cents: 6000 }]).ok).toBe(false));
  it('recusa passar do Pix', () => expect(checkAllocations(2000, titles, [{ transactionId: 'a', cents: 3000 }]).ok).toBe(false));
  it('calcula sobra', () => expect(checkAllocations(9000, titles, [{ transactionId: 'a', cents: 5000 }]).leftoverCents).toBe(4000));
});

describe('computeReturn', () => {
  const base = { unitsPerItem: 12, itemQuantity: 1, itemNetUnitPrice: 120, itemUnitCost: 60, alreadyReturnedUnits: 0 };
  it('2 brownies de um display com 12', () => {
    const r = computeReturn({ ...base, units: 2 });
    expect(r.value).toBe(20);
    expect(r.cost).toBe(10);
    expect(r.remainingUnits).toBe(12);
  });
  it('não deixa passar do que foi vendido', () => {
    expect(() => computeReturn({ ...base, units: 5, alreadyReturnedUnits: 9 })).toThrow();
  });
});

describe('monthTotals', () => {
  it('soma por mês', () => {
    const t = monthTotals([
      { createdAt: '2026-10-02', kind: 'troca', units: 2, value: 20, cost: 10 },
      { createdAt: '2026-10-09', kind: 'devolucao', units: 1, value: 10, cost: 5 },
      { createdAt: '2026-09-30', kind: 'troca', units: 3, value: 30, cost: 15 },
    ]);
    expect(t[0]).toMatchObject({ month: '2026-10', trocas: 1, devolucoes: 1, units: 3, lossValue: 25 });
    expect(t[1]?.month).toBe('2026-09');
  });
});

const facts = (o: Partial<CustomerFacts>): CustomerFacts => ({
  customerId: 'c', name: 'X', orders: 5, revenue: 1000, cost: 500, commission: 50, returnedValue: 0, returnLossCost: 0,
  unitsSold: 100, unitsReturned: 0, avgDelayDays: 0, overdueOpen: 0, lastOrderDate: null, ...o,
});

describe('evaluateCustomer', () => {
  it('bom cliente', () => expect(evaluateCustomer(facts({})).verdict).toBe('ok'));
  it('prejuízo não compensa', () => expect(evaluateCustomer(facts({ cost: 980 })).verdict).toBe('nao_compensa'));
  it('muita troca vira atenção', () => {
    const r = evaluateCustomer(facts({ unitsReturned: 9 }));
    expect(r.verdict).toBe('atencao');
    expect(r.reasons.join()).toMatch(/troca/);
  });
  it('troca consome a margem', () => {
    expect(evaluateCustomer(facts({ returnLossCost: 400, returnedValue: 100 })).profit).toBeLessThan(0);
  });
  it('ranking põe pior primeiro', () => {
    const r = rankCustomers([evaluateCustomer(facts({})), evaluateCustomer(facts({ customerId: 'z', cost: 990 }))]);
    expect(r[0]?.customerId).toBe('z');
  });
});
