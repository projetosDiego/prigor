import { describe, expect, it } from 'vitest';

import { buildNotaasPayload, parseNotaasInvoice } from '@/server/integrations/fiscal/notaas';
import type { FiscalInvoiceRequest } from '@/server/integrations/fiscal/provider';
import { canCancelInvoice, invoiceAdjustmentsBlocker, paymentCodeFor } from '@/server/domain/invoice';

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
    expect(p.dest).toMatchObject({ cnpj: '11222333000181', ie: '12345678', nome: 'Padaria Exemplo LTDA' });
    expect(p.dest.cpf).toBeUndefined();
    expect(p.dest.endereco).toMatchObject({ codigoMunicipio: 3304557, uf: 'RJ', cep: '20000000', numero: '10' });
    expect(p.items[0]).toMatchObject({ ncm: '19059090', cfop: '5101', csosn: '102', quantidade: 10, valorUnitario: 4.9, valorTotal: 49, unidade: 'UN' });
    expect(p.pagamentos).toEqual([{ tipoPagamento: '15', valor: 49 }]);
  });

  it('produção usa tpAmb 1 e PF manda CPF', () => {
    const p = buildNotaasPayload({ ...req, environment: 'producao', recipient: { ...req.recipient, cnpj: null, cpf: '123.456.789-09', ie: null } }) as Payload;
    expect(p.tpAmb).toBe(1);
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

describe('regras de NF do pedido', () => {
  it('forma de pagamento → tPag', () => {
    expect(paymentCodeFor('Boleto 7 dias')).toBe('15');
    expect(paymentCodeFor('Pix')).toBe('17');
    expect(paymentCodeFor('Cartão de Débito')).toBe('04');
    expect(paymentCodeFor('Cartão de Crédito')).toBe('03');
    expect(paymentCodeFor('Dinheiro na entrega')).toBe('01');
    expect(paymentCodeFor('A combinar')).toBe('99');
  });
  it('bloqueia desconto/frete até validar em homologação', () => {
    expect(invoiceAdjustmentsBlocker({ discount: '0', shipping: '0.00', otherCosts: '0', itemDiscounts: ['0.00'] })).toBeNull();
    expect(invoiceAdjustmentsBlocker({ discount: '5', shipping: '10', otherCosts: '0', itemDiscounts: [] })).toMatch(/desconto, frete/);
    expect(invoiceAdjustmentsBlocker({ discount: '0', shipping: '0', otherCosts: '0', itemDiscounts: ['1.00'] })).toMatch(/desconto/);
  });
  it('cancelamento só até 24h após autorização', () => {
    const auth = new Date('2026-10-06T10:00:00Z');
    expect(canCancelInvoice(auth, new Date('2026-10-07T09:59:00Z'))).toBe(true);
    expect(canCancelInvoice(auth, new Date('2026-10-07T10:01:00Z'))).toBe(false);
    expect(canCancelInvoice(null, new Date())).toBe(false);
  });
});
