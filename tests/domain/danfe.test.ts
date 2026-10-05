import fs from 'node:fs';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { code128C } from '@/lib/barcode128';
import { parseNfeXml } from '@/server/domain/nfe-xml';
import { renderDanfe } from '@/server/services/danfe-pdf';

const xml = fs.readFileSync(path.join(__dirname, '../fixtures/nfe-homologacao.xml'), 'utf8');

describe('code128C', () => {
  it('gera os mesmos módulos da implementação de referência (python-barcode)', () => {
    expect(code128C('33261064189960001245550010000000011889168119')).toBe(
      '1101001110010100011000111001001101100100010010100001100110011100101011101111011101111010110110011001011001110010111011000111010001101101100110011001000100110110011001101100110011011001100110011011001100111001011011011110100111011001001011110011001011100110110001101100011101011',
    );
  });
  it('recusa quantidade ímpar de dígitos', () => {
    expect(() => code128C('123')).toThrow();
  });
});

describe('parseNfeXml', () => {
  const d = parseNfeXml(xml);
  it('lê identificação, protocolo e ambiente', () => {
    expect(d).toMatchObject({
      accessKey: '33261064189960001245550010000000011889168119',
      protocol: '333260000913958',
      number: '1',
      series: '1',
      environment: 2,
      type: '1',
      operationNature: 'Venda de mercadoria',
    });
  });
  it('lê emitente, destinatário e totais', () => {
    expect(d.emit).toMatchObject({ doc: '64189960000124', ie: '16100960', crt: '4', tradeName: 'Doces Prigor', city: 'Rio de Janeiro' });
    expect(d.dest).toMatchObject({ doc: '58681770000127', ie: '15552719', district: 'Tijuca', zip: '20511330' });
    expect(d.totals.vNF).toBe('69.00');
  });
  it('lê itens com CSOSN, cobrança e informações complementares (com entidades)', () => {
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ code: '2000000000268', ncm: '19052090', cfop: '5102', cst: '0102', quantity: '1.0000', total: '69.00' });
    expect(d.billing.installments).toEqual([{ number: '001', dueDate: '2026-10-12', value: '69.00' }]);
    expect(d.billing.invoice?.number).toBe('PED-1115');
    expect(d.infCpl).toContain('Doces Prigor & você');
  });
  it('recusa XML que não é NF-e', () => {
    expect(() => parseNfeXml('<foo/>')).toThrow();
  });
});

describe('renderDanfe', () => {
  it('gera um PDF', async () => {
    const pdf = await renderDanfe(xml, { footer: 'Emitido pelo PRIGOR' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(3000);
  });
  it('pagina quando há muitos itens', async () => {
    const det = xml.match(/<det nItem="1">[\s\S]*?<\/det>/)![0];
    const many = xml.replace(det, Array.from({ length: 60 }, () => det).join(''));
    const pdf = await renderDanfe(many);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
