import { describe, expect, it } from 'vitest';

import { buildNotaasPayload, parseNotaasInvoice } from '@/server/integrations/fiscal/notaas';
import type { FiscalInvoiceRequest } from '@/server/integrations/fiscal/provider';
import {
  buildInfCpl,
  canCancelInvoice,
  distributeDiscount,
  ieIndicatorFor,
  invoiceAdjustmentsBlocker,
  paymentCodeFor,
} from '@/server/domain/invoice';

type Payload = Record<string, unknown> & {
  dest: Record<string, unknown> & { endereco: Record<string, unknown> };
  items: Array<Record<string, unknown>>;
  pagamentos: Array<Record<string, unknown>>;
};

const req: FiscalInvoiceRequest = {
  ref: 'NF-11001-1',
  environment: 'homologacao',
  operationNature: 'Venda de mercadoria',
  recipient: {
    name: 'Padaria Exemplo LTDA',
    cnpj: '11.222.333/0001-81',
    ie: '12.345.678',
    ieIndicator: 1,
    email: 'compras@padaria.com',
    address: {
      street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Rio de Janeiro',
      cityIbgeCode: '3304557', state: 'rj', zipCode: '20000-000',
    },
  },
  items: [
    { code: 'BRW-75', description: 'Brownie 7x5', ncm: '1905.90.90', cfop: '5101', csosn: '102', unit: 'un', quantity: '10.000', unitPrice: '4.90', total: '49.00' },
  ],
  payments: [{ code: '15', value: '49.00' }],
};

describe('buildNotaasPayload', () => {
  it('monta NF-e modelo 55 em homologação com destinatário PJ', () => {
    const p = buildNotaasPayload(req) as Payload;
    expect(p).toMatchObject({ modelo: 55, tpAmb: 2, referencia: 'NF-11001-1', naturezaOperacao: 'Venda de mercadoria' });
    expect(p.dest).toMatchObject({ cnpj: '11222333000181', ie: '12345678', indicadorIE: 1, nome: 'Padaria Exemplo LTDA' });
    expect(p.dest.cpf).toBeUndefined();
    expect(p.dest.endereco).toMatchObject({ codigoMunicipio: 3304557, uf: 'RJ', cep: '20000000', numero: '10' });
    expect(p.items[0]).toMatchObject({ ncm: '19059090', cfop: '5101', csosn: '102', quantidade: 10, valorUnitario: 4.9, valorTotal: 49, unidade: 'UN' });
    expect(p.pagamentos).toEqual([{ tipoPagamento: '15', valor: 49 }]);
  });

  it('produção usa tpAmb 1 e PF manda CPF', () => {
    const p = buildNotaasPayload({ ...req, environment: 'producao', recipient: { ...req.recipient, cnpj: null, cpf: '123.456.789-09', ie: null, ieIndicator: 9 } }) as Payload;
    expect(p.tpAmb).toBe(1);
    expect(p.dest.indicadorIE).toBe(9);
    expect(p.dest.cpf).toBe('12345678909');
    expect(p.dest.ie).toBeUndefined();
  });
});

describe('parseNotaasInvoice', () => {
  it('202 da emissão → processando com invoiceId', () => {
    expect(parseNotaasInvoice({ invoiceId: 'abc', status: 'queued' })).toMatchObject({ providerId: 'abc', status: 'processando' });
  });
  it('autorizada traz número, série e chave', () => {
    const r = parseNotaasInvoice(
      { invoiceId: 'abc', status: 'issued', numero: 12, serie: 1, chaveAcesso: '3'.repeat(44), dataRecebimento: '2026-10-06T10:00:00Z' },
    );
    expect(r).toMatchObject({ status: 'autorizada', number: 12, series: 1, accessKey: '3'.repeat(44), rejectionReason: null });
  });
  it('rejeitada traz código e motivo', () => {
    const r = parseNotaasInvoice({ data: { invoiceId: 'abc', status: 'error', cStat: 539, xMotivo: 'Duplicidade de NF-e' } });
    expect(r.status).toBe('rejeitada');
    expect(r.rejectionReason).toBe('539 — Duplicidade de NF-e');
  });
  it('usa o id conhecido quando a consulta não devolve', () => {
    expect(parseNotaasInvoice({ status: 'cancelled' }, 'xyz')).toMatchObject({ providerId: 'xyz', status: 'cancelada' });
  });
});

describe('indicador de IE', () => {
  it('IE preenchida = contribuinte; senão vale o indicador; padrão não contribuinte', () => {
    expect(ieIndicatorFor('86123456', null)).toBe(1);
    expect(ieIndicatorFor(null, '2')).toBe(2);
    expect(ieIndicatorFor('', '9')).toBe(9);
    expect(ieIndicatorFor(null, null)).toBe(9);
  });
  it('não contribuinte não manda IE para a Notaas', () => {
    const p = buildNotaasPayload({ ...req, recipient: { ...req.recipient, ieIndicator: 9 } }) as Payload;
    expect(p.dest.ie).toBeUndefined();
    expect(p.dest.indicadorIE).toBe(9);
  });
});

describe('regras de NF do pedido', () => {
  it('forma de pagamento → tPag', () => {
    expect(paymentCodeFor('Boleto 7 dias')).toBe('15');
    expect(paymentCodeFor('Pix')).toBe('17');
    expect(paymentCodeFor('Cartão de Débito')).toBe('04');
    expect(paymentCodeFor('Cartão de Crédito')).toBe('03');
    expect(paymentCodeFor('Dinheiro na entrega')).toBe('01');
    expect(paymentCodeFor('A combinar')).toBe('99');
  });
  it('só "outros custos" bloqueia a NF', () => {
    expect(invoiceAdjustmentsBlocker({ otherCosts: '0.00' })).toBeNull();
    expect(invoiceAdjustmentsBlocker({ otherCosts: '5' })).toMatch(/outros custos/);
  });
  it('rateia o desconto do pedido entre os itens, somando exato', () => {
    const r = distributeDiscount(
      [{ gross: '100.00', itemDiscount: '0' }, { gross: '50.00', itemDiscount: '5.00' }, { gross: '33.33', itemDiscount: '0' }],
      '10.00',
    );
    const total = r.reduce((a, b) => a + Number(b), 0);
    expect(total.toFixed(2)).toBe('15.00'); // 10 do pedido + 5 do item
    expect(r).toEqual(['5.61', '7.52', '1.87']); // 5 do item + 2,52 de rateio no 2º
  });
  it('monta infCpl com pedido, mensagem e observação', () => {
    expect(buildInfCpl({ orderNumber: 1115, message: 'Obrigado!', notes: 'Entregar na cozinha' })).toBe(
      'Pedido PRIGOR nº 1115. Obrigado! Obs.: Entregar na cozinha',
    );
    expect(buildInfCpl({ orderNumber: 7 })).toBe('Pedido PRIGOR nº 7.');
  });
  it('cancelamento só até 24h após autorização', () => {
    const auth = new Date('2026-10-06T10:00:00Z');
    expect(canCancelInvoice(auth, new Date('2026-10-07T09:59:00Z'))).toBe(true);
    expect(canCancelInvoice(auth, new Date('2026-10-07T10:01:00Z'))).toBe(false);
    expect(canCancelInvoice(null, new Date())).toBe(false);
  });
});
