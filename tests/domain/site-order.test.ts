import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { isFreshTimestamp, lineDiscount, priceSiteOrder, siteOrderNotes, sitePaymentMethod } from '@/server/domain/site-order';
import { verifySiteRequest } from '@/server/integrations/site';

const n = (d: { toNumber(): number }): number => d.toNumber();

describe('priceSiteOrder', () => {
  it('aplica o % de desconto por linha e confere o total enviado pelo site', () => {
    // 10 mini guirlandas a 25,00 com 12% (250 − 30 = 220) + 1 taça a 145,00
    const r = priceSiteOrder(
      [
        { sku: 'NATAL-GUIRLANDA-MINI', name: 'Mini Guirlanda', option: 'Ninho', quantity: 6, unitPrice: '25.00', discountPct: 12 },
        { sku: 'NATAL-GUIRLANDA-MINI', name: 'Mini Guirlanda', option: 'Chocolate', quantity: 4, unitPrice: '25.00', discountPct: 12 },
        { sku: 'NATAL-TACA-RED', name: 'Taça Red', option: '', quantity: 1, unitPrice: '145.00', discountPct: 0 },
      ],
      '365.00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(n(r.lines[0]!.discountItem)).toBe(18);
    expect(n(r.lines[1]!.discountItem)).toBe(12);
    // No ERP o subtotal já é a soma dos itens líquidos (mesma regra de calculateOrder)
    expect(n(r.subtotal)).toBe(365);
    expect(n(r.total)).toBe(365);
  });

  it('arredonda o desconto meio para cima no centavo, igual ao site', () => {
    // 11 × 8,00 = 88,00 → 12% = 10,56 ; 3 × 7,95 = 23,85 → 12% = 2,862 → 2,86
    expect(n(lineDiscount(11, '8.00', 12))).toBe(10.56);
    expect(n(lineDiscount(3, '7.95', 12))).toBe(2.86);
    expect(n(lineDiscount(1, '0.125', 100))).toBe(0.13);
    expect(n(lineDiscount(5, '10.00', 0))).toBe(0);
  });

  it('recusa quando o total do site não bate com o recalculado', () => {
    const r = priceSiteOrder([{ sku: 'X-1', name: 'Item', option: '', quantity: 2, unitPrice: '10.00', discountPct: 0 }], '19.00');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('20.00');
  });

  it('recusa itens inválidos', () => {
    expect(priceSiteOrder([], '0.00').ok).toBe(false);
    expect(priceSiteOrder([{ sku: 'X-1', name: 'A', option: '', quantity: 0, unitPrice: '1.00', discountPct: 0 }], '0.00').ok).toBe(false);
    expect(priceSiteOrder([{ sku: 'X-1', name: 'A', option: '', quantity: 1.5, unitPrice: '1.00', discountPct: 0 }], '1.50').ok).toBe(false);
    expect(priceSiteOrder([{ sku: 'X-1', name: 'A', option: '', quantity: 1, unitPrice: '0.00', discountPct: 0 }], '0.00').ok).toBe(false);
    expect(priceSiteOrder([{ sku: 'X-1', name: 'A', option: '', quantity: 1, unitPrice: '1.00', discountPct: 95 }], '0.05').ok).toBe(false);
  });
});

describe('siteOrderNotes', () => {
  it('resume origem, recebimento, pagamento e as escolhas dos itens', () => {
    const notes = siteOrderNotes({
      code: 'NAT-0007',
      campaign: 'natal2026',
      fulfillment: { type: 'RETIRADA', pickupPoint: 'Méier' },
      payment: { plan: 'SINAL_50', method: 'PIX', amountDue: '182.50' },
      lines: [
        { sku: 'A-1', name: 'Mini Guirlanda', option: 'Ninho', quantity: 6, unitPrice: '25.00', discountPct: 12 },
        { sku: 'B-1', name: 'Taça Red', option: '', quantity: 1, unitPrice: '145.00', discountPct: 0 },
      ],
      customerNotes: 'Cartão: Feliz Natal!',
    });
    expect(notes).toBe(
      '[Site · Natal 2026 · NAT-0007] | Retirada: Méier | Sinal R$ 182,50 via Pix — aguardando confirmação | Escolhas: 6× Mini Guirlanda (Ninho) | Obs. do cliente: Cartão: Feliz Natal!',
    );
  });

  it('entrega e pagamento total no cartão, sem escolhas nem observação', () => {
    const notes = siteOrderNotes({
      code: 'NAT-0008',
      campaign: 'pascoa',
      fulfillment: { type: 'ENTREGA', pickupPoint: '' },
      payment: { plan: 'TOTAL', method: 'CARTAO', amountDue: '50.00' },
      lines: [{ sku: 'A-1', name: 'Item', option: '', quantity: 1, unitPrice: '50.00', discountPct: 0 }],
      customerNotes: '',
    });
    expect(notes).toBe('[Site · pascoa · NAT-0008] | Entrega (taxa a combinar) | Pagamento total R$ 50,00 via Cartão de crédito — aguardando confirmação');
    expect(sitePaymentMethod('PIX')).toBe('Pix');
  });
});

describe('autenticação do site', () => {
  const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
  const body = '{"code":"NAT-0001"}';
  const sign = (ts: string, b = body, s = SECRET) => `sha256=${createHmac('sha256', s).update(`${ts}.${b}`).digest('hex')}`;
  afterEach(() => {
    delete process.env.SITE_ORDERS_SECRET;
  });

  it('timestamp vale por 10 minutos', () => {
    expect(isFreshTimestamp('1000', 1500)).toBe(true);
    expect(isFreshTimestamp('1000', 1601)).toBe(false);
    expect(isFreshTimestamp('abc', 1000)).toBe(false);
  });

  it('fica desligada sem segredo configurado', () => {
    expect(verifySiteRequest(body, '1000', sign('1000'), 1000)).toMatchObject({ ok: false, status: 503 });
  });

  it('aceita assinatura correta e recusa adulteração, segredo errado ou expirada', () => {
    process.env.SITE_ORDERS_SECRET = SECRET;
    expect(verifySiteRequest(body, '1000', sign('1000'), 1000)).toEqual({ ok: true });
    expect(verifySiteRequest(body.replace('0001', '0002'), '1000', sign('1000'), 1000)).toMatchObject({ ok: false, status: 401 });
    expect(verifySiteRequest(body, '1000', sign('1000', body, 'outro-segredo-qualquer-com-32-caracteres'), 1000)).toMatchObject({ ok: false, status: 401 });
    expect(verifySiteRequest(body, '1000', sign('1000'), 2000)).toMatchObject({ ok: false, status: 401 });
    expect(verifySiteRequest(body, null, null, 1000)).toMatchObject({ ok: false, status: 401 });
  });
});
