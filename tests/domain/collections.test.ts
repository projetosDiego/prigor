import { describe, expect, it } from 'vitest';

import { bucketOf, daysLate, nextReminder } from '@/server/domain/collections';

describe('régua de cobrança', () => {
  it('calcula dias de atraso entre datas civis', () => {
    expect(daysLate('2026-10-10', '2026-10-12')).toBe(2);
    expect(daysLate('2026-10-10', '2026-10-08')).toBe(-2);
    expect(daysLate('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('escolhe a etapa pelo atraso', () => {
    const none = new Set<string>();
    expect(nextReminder(-3, none)).toBeNull();
    expect(nextReminder(-2, none)).toBe('antes2');
    expect(nextReminder(0, none)).toBe('vencimento');
    expect(nextReminder(1, none)).toBe('vencimento');
    expect(nextReminder(3, none)).toBe('atraso3');
    expect(nextReminder(7, none)).toBe('atraso7');
  });

  it('não repete etapa enviada nem cobra dívida muito antiga', () => {
    expect(nextReminder(0, new Set(['vencimento']))).toBeNull();
    expect(nextReminder(4, new Set(['atraso3']))).toBeNull();
    expect(nextReminder(30, new Set())).toBeNull();
  });

  it('classifica em faixas', () => {
    expect(bucketOf(5)).toBe('atrasado');
    expect(bucketOf(0)).toBe('hoje');
    expect(bucketOf(-3)).toBe('proximo');
    expect(bucketOf(-20)).toBe('futuro');
  });
});
