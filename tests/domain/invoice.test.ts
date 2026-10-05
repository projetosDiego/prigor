import { describe, expect, it } from 'vitest';

import {
  invoiceReadinessProblems,
  isValidCfop,
  isValidNcm,
  resolveCfop,
  type InvoiceCustomer,
  type InvoiceIssuer,
} from '@/server/domain/invoice';

const issuer: InvoiceIssuer = {
  cnpj: '12.345.678/0001-90',
  ie: '12345678',
  legalName: 'Doces Prigor',
  address: 'Campo São Cristóvão',
  number: 'S/N',
  neighborhood: 'São Cristóvão',
  city: 'Rio de Janeiro',
  cityIbgeCode: '3304557',
  state: 'RJ',
  zipCode: '20921-440',
  defaultCfopInState: '5101',
  defaultCfopOutState: '6101',
  defaultCsosn: '102',
};

const customer: InvoiceCustomer = {
  legalName: 'Padaria Exemplo LTDA',
  tradeName: 'Padaria Exemplo',
  cnpj: '11222333000181',
  cpf: null,
  address: 'Rua A',
  number: '10',
  neighborhood: 'Centro',
  city: 'Rio de Janeiro',
  state: 'RJ',
  zipCode: '20000000',
};

describe('formatos fiscais', () => {
  it('NCM com 8 dígitos (aceita pontos)', () => {
    expect(isValidNcm('1905.90.90')).toBe(true);
    expect(isValidNcm('19059090')).toBe(true);
    expect(isValidNcm('1905')).toBe(false);
    expect(isValidNcm(null)).toBe(false);
  });
  it('CFOP de saída com 4 dígitos', () => {
    expect(isValidCfop('5101')).toBe(true);
    expect(isValidCfop('5.101')).toBe(true);
    expect(isValidCfop('1101')).toBe(false);
    expect(isValidCfop(null)).toBe(false);
  });
  it('CFOP: usa o do produto; senão o padrão pela UF', () => {
    const d = { inState: '5101', outState: '6101' };
    expect(resolveCfop('5102', 'RJ', 'SP', d)).toBe('5102');
    expect(resolveCfop(null, 'RJ', 'rj', d)).toBe('5101');
    expect(resolveCfop(null, 'RJ', 'SP', d)).toBe('6101');
  });
});

describe('invoiceReadinessProblems', () => {
  it('tudo certo → nenhum problema', () => {
    expect(
      invoiceReadinessProblems({ issuer, customer, items: [{ name: 'Brownie', ncm: '19059090', cfop: null }] }),
    ).toEqual([]);
  });

  it('sem configuração fiscal', () => {
    const p = invoiceReadinessProblems({ issuer: null, customer, items: [{ name: 'Brownie', ncm: '19059090', cfop: '5101' }] });
    expect(p.some((m) => m.includes('Configuração fiscal'))).toBe(true);
  });

  it('aponta cliente sem documento/endereço e produto sem NCM', () => {
    const p = invoiceReadinessProblems({
      issuer,
      customer: { ...customer, cnpj: null, cpf: null, number: null, zipCode: '123' },
      items: [{ name: 'Brownie', ncm: null, cfop: null }],
    });
    expect(p).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sem CNPJ ou CPF'),
        expect.stringContaining('endereço incompleto'),
        expect.stringContaining('CEP inválido'),
        expect.stringContaining('NCM ausente'),
      ]),
    );
  });

  it('pedido sem itens', () => {
    expect(invoiceReadinessProblems({ issuer, customer, items: [] })).toContain('Pedido sem itens.');
  });
});
