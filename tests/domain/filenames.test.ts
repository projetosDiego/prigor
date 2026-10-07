import { describe, expect, it } from 'vitest';

import { contentDisposition, docFilename, filenameFromDisposition, shortCustomerName } from '@/lib/filenames';

describe('nome de arquivo dos documentos', () => {
  it('boleto: "Boleto <cliente> Pedido <nº>"', () => {
    expect(docFilename('Boleto', 'KINN', 11001, 'pdf')).toBe('Boleto Kinn Pedido 11001.pdf');
  });
  it('pedido não repete a palavra', () => {
    expect(docFilename('Pedido', 'Kinn', 11001, 'pdf')).toBe('Pedido Kinn 11001.pdf');
  });
  it('NF-e e XML', () => {
    expect(docFilename('NF-e', 'Kinn', 7, 'pdf')).toBe('NF-e Kinn Pedido 7.pdf');
    expect(docFilename('XML NF-e', 'Kinn', 7, 'xml')).toBe('XML NF-e Kinn Pedido 7.xml');
  });
  it('tira sufixo de empresa e caracteres proibidos', () => {
    expect(shortCustomerName('MB+D COFFEE CHARME LTDA')).toBe('MB+D Coffee Charme');
    expect(shortCustomerName('Padaria "Boa/Vista" ME')).toBe('Padaria Boa Vista');
    expect(shortCustomerName(null)).toBe('Cliente');
  });
  it('cabeçalho aceita acento e volta ao mesmo nome', () => {
    const h = contentDisposition('inline', 'Boleto Açaí Pedido 5.pdf');
    expect(h).toContain('filename="Boleto Acai Pedido 5.pdf"');
    expect(filenameFromDisposition(h, 'x.pdf')).toBe('Boleto Açaí Pedido 5.pdf');
  });
});
