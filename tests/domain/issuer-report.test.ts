import { describe, expect, it } from 'vitest';

import { hasActiveDocuments } from '@/server/domain/issuer';
import { limitStatus, sumBy, toCsv, yearProjection } from '@/server/domain/issuer-report';

describe('relatório por CNPJ', () => {
  it('soma em centavos, sem erro de arredondamento', () => {
    const rows = [
      { issuerId: 'a', value: 0.1 },
      { issuerId: 'a', value: 0.2 },
      { issuerId: 'b', value: 5 },
    ];
    expect(sumBy(rows, (r) => r.issuerId === 'a')).toEqual({ count: 2, total: 0.3 });
    expect(sumBy(rows, () => true)).toEqual({ count: 3, total: 5.3 });
  });

  it('níveis do limite anual', () => {
    expect(limitStatus(40_000, 81_000).level).toBe('ok');
    expect(limitStatus(65_000, 81_000).level).toBe('atencao');
    expect(limitStatus(78_000, 81_000).level).toBe('critico');
    expect(limitStatus(82_000, 81_000)).toMatchObject({ level: 'estourado', remaining: -1000 });
    expect(limitStatus(10, 0)).toEqual({ pct: 0, level: 'ok', remaining: 0 });
  });

  it('projeção linear do ano', () => {
    // 1º de julho de 2026 = dia 182 de 365
    expect(yearProjection(18_200, new Date(Date.UTC(2026, 6, 1)))).toBeCloseTo(36_500, 0);
  });

  it('CSV para Excel: BOM, ponto e vírgula, vírgula decimal e aspas', () => {
    const csv = toCsv(['A', 'B'], [['x;y', 10.5], [null, 'ok']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x;y";10,50');
    expect(csv).toContain(';ok');
  });
});

describe('trava do CNPJ do pedido', () => {
  it('trava com boleto em aberto/pago ou NF autorizada/processando', () => {
    expect(hasActiveDocuments({ boletos: [{ status: 'registrado' }], invoices: [] })).toBe(true);
    expect(hasActiveDocuments({ boletos: [], invoices: [{ status: 'processando' }] })).toBe(true);
  });
  it('não trava com tentativa com erro, baixada, rejeitada ou cancelada', () => {
    expect(
      hasActiveDocuments({
        boletos: [{ status: 'erro' }, { status: 'baixado' }, { status: 'cancelado' }],
        invoices: [{ status: 'rejeitada' }, { status: 'cancelada' }, { status: 'descartada' }],
      }),
    ).toBe(false);
  });
});
