import { describe, expect, it } from 'vitest';

import { buildBoletoPayload, parseIssueResponse, parseSituation } from '@/server/integrations/sicoob/boletos';
import { boletoPayerProblems, payerDocument } from '@/server/domain/billing';

type Payload = Record<string, unknown> & { pagador: Record<string, unknown> };

const account = { numeroCliente: 123456, codigoModalidade: 1, numeroContaCorrente: 372285 };
const base = {
  seuNumero: 'PRG-11001-1',
  orderNumber: 11001,
  value: '150.40',
  issueDate: '2026-10-06',
  dueDate: '2026-10-13',
  payer: {
    document: '11.222.333/0001-81',
    name: 'Padaria Exemplo LTDA',
    address: 'Rua A, 10',
    neighborhood: 'Centro',
    city: 'Rio de Janeiro',
    zipCode: '20000-000',
    state: 'rj',
    email: 'compras@padaria.com',
  },
};

describe('buildBoletoPayload', () => {
  it('monta o corpo com conta, valor, datas e pagador normalizado', () => {
    const p = buildBoletoPayload(base, account) as Payload;
    expect(p).toMatchObject({
      numeroCliente: 123456,
      codigoModalidade: 1,
      numeroContaCorrente: 372285,
      seuNumero: 'PRG-11001-1',
      valor: 150.4,
      dataEmissao: '2026-10-06',
      dataVencimento: '2026-10-13',
      codigoEspecieDocumento: 'DM',
      codigoCadastrarPIX: 0,
      tipoMulta: 0,
      tipoJurosMora: 3,
    });
    expect(p.pagador).toEqual({
      numeroCpfCnpj: '11222333000181',
      nome: 'Padaria Exemplo LTDA',
      endereco: 'Rua A, 10',
      bairro: 'Centro',
      cidade: 'Rio de Janeiro',
      cep: '20000000',
      uf: 'RJ',
      email: 'compras@padaria.com',
    });
  });

  it('boleto híbrido (Pix) só quando o convênio tem Pix habilitado', () => {
    expect((buildBoletoPayload(base, account) as Payload).codigoCadastrarPIX).toBe(0);
    expect((buildBoletoPayload(base, { ...account, pix: true }) as Payload).codigoCadastrarPIX).toBe(1);
  });

  it('multa e juros entram a partir do dia seguinte ao vencimento', () => {
    const p = buildBoletoPayload({ ...base, finePct: '2.00', interestMonthPct: '1.00' }, account) as Payload;
    expect(p).toMatchObject({ tipoMulta: 2, valorMulta: 2, dataMulta: '2026-10-14', tipoJurosMora: 2, valorJurosMora: 1, dataJurosMora: '2026-10-14' });
  });

  it('corta textos no limite do banco e omite e-mail vazio', () => {
    const p = buildBoletoPayload(
      { ...base, payer: { ...base.payer, name: 'X'.repeat(80), email: null } },
      account,
    ) as Payload;
    expect(p.pagador.nome).toHaveLength(50);
    expect(p.pagador.email).toBeUndefined();
  });
});

describe('respostas do Sicoob', () => {
  it('emissão: lê nossoNumero, linha digitável e Pix', () => {
    expect(
      parseIssueResponse({ resultado: { nossoNumero: 987, linhaDigitavel: '7569...', codigoBarras: '7569', qrCode: '000201...' } }),
    ).toEqual({ nossoNumero: '987', linhaDigitavel: '7569...', codigoBarras: '7569', pixCopiaECola: '000201...' });
  });

  it('emissão sem nossoNumero é erro', () => {
    expect(() => parseIssueResponse({ resultado: {} })).toThrow();
  });

  it('situação: liquidado = pago, com data do histórico', () => {
    const s = parseSituation({
      resultado: {
        situacaoBoleto: 'Liquidado',
        listaHistorico: [{ descricaoHistorico: 'Liquidação', dataHistorico: '2026-10-10T00:00:00', valorHistorico: 150.4 }],
      },
    });
    expect(s).toMatchObject({ state: 'pago', paidAt: '2026-10-10', paidValue: '150.4' });
  });

  it('situação: em aberto e baixado', () => {
    expect(parseSituation({ resultado: { situacaoBoleto: 'Em Aberto' } }).state).toBe('aberto');
    expect(parseSituation({ resultado: [{ situacaoBoleto: 'Baixado' }] }).state).toBe('baixado');
    expect(parseSituation({}).state).toBe('desconhecido');
  });
});

describe('pagador', () => {
  const ok = {
    tradeName: 'Padaria', legalName: null, cnpj: '11222333000181', cpf: null,
    address: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', zipCode: '20000000',
  };
  it('cadastro completo passa', () => {
    expect(boletoPayerProblems(ok)).toEqual([]);
  });
  it('aponta o que falta', () => {
    expect(boletoPayerProblems({ ...ok, cnpj: null, zipCode: '123', state: null })).toEqual([
      'CNPJ ou CPF do cliente',
      'UF do cliente',
      'CEP do cliente',
    ]);
  });
  it('CNPJ tem preferência sobre CPF', () => {
    expect(payerDocument({ cnpj: '11222333000181', cpf: '12345678901' })).toBe('11222333000181');
    expect(payerDocument({ cnpj: null, cpf: '123.456.789-01' })).toBe('12345678901');
  });
});
