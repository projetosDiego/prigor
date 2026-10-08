import { describe, expect, it } from 'vitest';

import {
  boletoIssueBlocker,
  buildInvoiceRef,
  buildSeuNumero,
  canTransitionBoleto,
  checkBoletoPaymentMethod,
  isBoletoPaymentMethod,
  nextSequence,
} from '@/server/domain/billing';

describe('isBoletoPaymentMethod', () => {
  it('reconhece qualquer forma com "boleto" no nome, sem ligar para caixa/acento', () => {
    expect(isBoletoPaymentMethod('Boleto 7 dias')).toBe(true);
    expect(isBoletoPaymentMethod('BOLETO')).toBe(true);
    expect(isBoletoPaymentMethod('  bolêto 15 dias ')).toBe(true);
  });
  it('não confunde outras formas', () => {
    expect(isBoletoPaymentMethod('Pix')).toBe(false);
    expect(isBoletoPaymentMethod('Dinheiro')).toBe(false);
    expect(isBoletoPaymentMethod('')).toBe(false);
    expect(isBoletoPaymentMethod(null)).toBe(false);
  });
});

describe('checkBoletoPaymentMethod', () => {
  it('forma que não é boleto passa para qualquer um', () => {
    expect(checkBoletoPaymentMethod({ paymentMethod: 'Pix', boletoAllowed: false, isManagement: false })).toEqual({
      ok: true,
      override: false,
    });
  });
  it('cliente liberado: vendedor pode', () => {
    expect(
      checkBoletoPaymentMethod({ paymentMethod: 'Boleto 7 dias', boletoAllowed: true, isManagement: false }),
    ).toEqual({ ok: true, override: false });
  });
  it('cliente não liberado: vendedor/portal passa, marcado para a gerência aprovar', () => {
    const r = checkBoletoPaymentMethod({ paymentMethod: 'Boleto 7 dias', boletoAllowed: false, isManagement: false });
    expect(r).toEqual({ ok: true, override: true });
  });
  it('cliente não liberado: gerência pode, marcado como override', () => {
    expect(
      checkBoletoPaymentMethod({ paymentMethod: 'Boleto 15 dias', boletoAllowed: false, isManagement: true }),
    ).toEqual({ ok: true, override: true });
  });
});

describe('identificadores', () => {
  it('monta seuNumero e referência da NF', () => {
    expect(buildSeuNumero(11001, 1)).toBe('PRG-11001-1');
    expect(buildInvoiceRef(11001, 2)).toBe('NF-11001-2');
  });
  it('recusa entrada inválida', () => {
    expect(() => buildSeuNumero(0, 1)).toThrow();
    expect(() => buildSeuNumero(11001, 0)).toThrow();
    expect(() => buildSeuNumero(1234567890123, 1)).toThrow(); // PRG-1234567890123-1 = 19 caracteres
  });
  it('próxima sequência considera a maior já usada', () => {
    expect(nextSequence([])).toBe(1);
    expect(nextSequence(['PRG-11001-1', 'PRG-11001-3'])).toBe(4);
  });
});

describe('ciclo de vida do boleto', () => {
  it('pago é intocável', () => {
    expect(canTransitionBoleto('pago', 'baixado')).toBe(false);
    expect(canTransitionBoleto('pago', 'cancelado')).toBe(false);
  });
  it('registrado pode ser pago ou baixado', () => {
    expect(canTransitionBoleto('registrado', 'pago')).toBe(true);
    expect(canTransitionBoleto('registrado', 'baixado')).toBe(true);
    expect(canTransitionBoleto('registrado', 'cancelado')).toBe(false);
  });
});

describe('boletoIssueBlocker', () => {
  const base = {
    orderStatus: 'confirmado' as const,
    orderTotal: '150.00',
    dueDate: '2026-10-12',
    today: '2026-10-05',
    existingStatuses: [] as never[],
  };
  it('libera pedido válido', () => {
    expect(boletoIssueBlocker(base)).toBeNull();
  });
  it('bloqueia cancelado, sem valor, sem vencimento ou vencido', () => {
    expect(boletoIssueBlocker({ ...base, orderStatus: 'cancelado' })).toMatch(/cancelado/);
    expect(boletoIssueBlocker({ ...base, orderTotal: '0' })).toMatch(/sem valor/);
    expect(boletoIssueBlocker({ ...base, dueDate: null })).toMatch(/vencimento/);
    expect(boletoIssueBlocker({ ...base, dueDate: '2026-10-01' })).toMatch(/já passou/);
  });
  it('bloqueia quando já existe boleto em aberto ou pago', () => {
    expect(boletoIssueBlocker({ ...base, existingStatuses: ['registrado'] })).toMatch(/em aberto/);
    expect(boletoIssueBlocker({ ...base, existingStatuses: ['pago'] })).toMatch(/pago/);
  });
  it('permite reemitir depois de baixa/cancelamento/erro', () => {
    expect(boletoIssueBlocker({ ...base, existingStatuses: ['baixado', 'cancelado', 'erro'] })).toBeNull();
  });
});
