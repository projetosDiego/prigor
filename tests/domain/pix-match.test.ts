import { describe, expect, it } from 'vitest';

import { nameSimilarity, suggestForPix, type OpenTitle } from '@/server/domain/pix-match';

const title = (over: Partial<OpenTitle> & Pick<OpenTitle, 'transactionId' | 'customerId' | 'value'>): OpenTitle => ({
  orderNumero: 1,
  customerLabel: over.customerId,
  names: [over.customerId],
  docs: [],
  dueDate: null,
  ...over,
});

describe('nameSimilarity', () => {
  it('reconhece abreviações, iniciais e jr', () => {
    expect(nameSimilarity('GILSON M PORTELLA JR', 'Gilson Magnavita Portella Junior')).toBeGreaterThan(0.8);
  });
  it('ignora ltda/me e números de MEI', () => {
    expect(nameSimilarity('MICHELE PIRES DA SILVA', '49.873.641 MICHELE PIRES DA SILVA')).toBe(1);
    expect(nameSimilarity('ALTAS HORAS COMERCIO DE BEBIDAS LTDA', 'DEPOSITO DE BEBIDAS ALTAS HORAS')).toBeGreaterThan(0.6);
  });
  it('nomes diferentes dão baixo', () => {
    expect(nameSimilarity('JOAO PEREIRA', 'Augustus')).toBe(0);
  });
  it('tolera erro de digitação de uma letra', () => {
    expect(nameSimilarity('Magnavita', 'Magnavitta')).toBeGreaterThan(0.8);
  });
});

describe('suggestForPix', () => {
  const titles: OpenTitle[] = [
    title({ transactionId: 't1', customerId: 'c1', customerLabel: 'Gilson Magnavita Portella Junior', names: ['Gilson Magnavita Portella Junior'], value: 69.9, orderNumero: 1118 }),
    title({ transactionId: 't2', customerId: 'c2', customerLabel: 'Restaurante Sabor da Passagem', names: ['RESTAURANTE SABOR DA PASSAGEM LTDA'], value: 69.9, orderNumero: 1116 }),
    title({ transactionId: 't3', customerId: 'c3', customerLabel: 'Augustus', names: ['Augustus'], value: 82.5, orderNumero: 1120 }),
    title({ transactionId: 't4', customerId: 'c4', customerLabel: 'Bom Preço da Ilha', names: ['BOM PRECO DA ILHA'], value: 40, orderNumero: 1121 }),
    title({ transactionId: 't5', customerId: 'c4', customerLabel: 'Bom Preço da Ilha', names: ['BOM PRECO DA ILHA'], value: 29.99, orderNumero: 1125 }),
  ];

  it('valor igual + nome parecido = confiança alta, escolhe o cliente certo entre dois de mesmo valor', () => {
    const r = suggestForPix({ value: 69.9, payerName: 'GILSON M PORTELLA JR', payerDocument: null }, titles);
    expect(r[0]!.confidence).toBe('alta');
    expect(r[0]!.transactionIds).toEqual(['t1']);
    expect(r[0]!.canSettle).toBe(true);
  });

  it('só o valor bate e é único: média; valor repetido sem nome: baixa', () => {
    const unique = suggestForPix({ value: 82.5, payerName: 'MARIA SOUZA', payerDocument: null }, titles);
    expect(unique[0]!.transactionIds).toEqual(['t3']);
    expect(unique[0]!.confidence).toBe('media');
    const dup = suggestForPix({ value: 69.9, payerName: 'FULANO DE TAL', payerDocument: null }, titles);
    expect(dup.every((s) => s.confidence === 'baixa')).toBe(true);
    expect(dup.length).toBe(2);
  });

  it('Pix que paga dois títulos do mesmo cliente', () => {
    const r = suggestForPix({ value: 69.99, payerName: 'Bom Preco da Ilha', payerDocument: null }, titles);
    expect(r[0]!.transactionIds.sort()).toEqual(['t4', 't5']);
    expect(r[0]!.canSettle).toBe(true);
    expect(r[0]!.total).toBeCloseTo(69.99, 2);
  });

  it('nome bate mas valor não: só informativo, sem baixa', () => {
    const r = suggestForPix({ value: 50, payerName: 'AUGUSTUS', payerDocument: null }, titles);
    expect(r[0]!.confidence).toBe('info');
    expect(r[0]!.canSettle).toBe(false);
  });

  it('CPF/CNPJ completo confere mesmo sem nome', () => {
    const withDoc = [title({ transactionId: 'x', customerId: 'c9', value: 100, names: ['Padaria Central'], docs: ['12345678000199'] }), title({ transactionId: 'y', customerId: 'c8', value: 100, names: ['Outra'], docs: [] })];
    const r = suggestForPix({ value: 100, payerName: null, payerDocument: '12345678000199' }, withDoc);
    expect(r[0]!.transactionIds).toEqual(['x']);
    expect(r[0]!.confidence).toBe('alta');
  });

  it('sem nada parecido não sugere', () => {
    expect(suggestForPix({ value: 1234.56, payerName: 'ZZZ', payerDocument: null }, titles)).toEqual([]);
  });
});
