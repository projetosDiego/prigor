import { describe, expect, it } from 'vitest';

import { extractPayer, parseMoney, parseStatement } from '@/server/domain/pix-statement';

describe('parseMoney', () => {
  it('formatos BR e sufixo C/D', () => {
    expect(parseMoney('1.234,56')).toEqual({ value: 1234.56, credit: true });
    expect(parseMoney('69,90C')).toEqual({ value: 69.9, credit: true });
    expect(parseMoney('69,90 D')).toEqual({ value: 69.9, credit: false });
    expect(parseMoney('-10,00')).toEqual({ value: 10, credit: false });
    expect(parseMoney('R$ 5,00')).toEqual({ value: 5, credit: true });
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('extractPayer', () => {
  it('tira o rótulo do Pix', () => {
    expect(extractPayer('PIX RECEBIDO - GILSON M PORTELLA JR').name).toBe('GILSON M PORTELLA JR');
    expect(extractPayer('RECEBIMENTO PIX MARIA DA SILVA').name).toBe('MARIA DA SILVA');
    expect(extractPayer('CRÉD. PIX: PADARIA CENTRAL LTDA 12.345.678/0001-99').name).toBe('PADARIA CENTRAL LTDA');
  });
  it('captura CPF/CNPJ completo quando vem na descrição', () => {
    expect(extractPayer('PIX RECEBIDO JOAO 12345678901').document).toBe('12345678901');
  });
  it('sem nome devolve null', () => {
    expect(extractPayer('PIX RECEBIDO').name).toBeNull();
  });
});

describe('parseStatement', () => {
  it('OFX: só créditos de Pix', () => {
    const ofx = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261010120000<TRNAMT>69.90<FITID>A1<MEMO>PIX RECEBIDO - GILSON M PORTELLA JR
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-20.00<FITID>A2<MEMO>PIX ENVIADO - FORNECEDOR
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261011<TRNAMT>100.00<FITID>A3<MEMO>TED RECEBIDA
</STMTTRN></BANKTRANLIST></OFX>`;
    const r = parseStatement(ofx);
    expect(r.format).toBe('ofx');
    expect(r.pix).toHaveLength(1);
    expect(r.pix[0]).toMatchObject({ externalId: 'ofx:A1', date: '2026-10-10', value: 69.9, payerName: 'GILSON M PORTELLA JR' });
    expect(r.ignored).toBe(2);
  });

  it('CSV com ; e coluna de saldo', () => {
    const csv = [
      'Data;Histórico;Valor;Saldo',
      '10/10/2026;PIX RECEBIDO - AUGUSTUS;82,50C;1.000,00C',
      '10/10/2026;PIX ENVIADO - FORNECEDOR;20,00D;980,00C',
      '11/10/2026;PIX RECEBIDO - AUGUSTUS;82,50C;1.062,50C',
    ].join('\n');
    const r = parseStatement(csv);
    expect(r.format).toBe('csv');
    expect(r.pix).toHaveLength(2);
    expect(r.pix[0]!.value).toBe(82.5);
    expect(r.pix[0]!.externalId).not.toBe(r.pix[1]!.externalId);
    expect(r.ignored).toBe(1);
  });

  it('reimportar o mesmo arquivo gera os mesmos ids; linhas idênticas ficam distintas', () => {
    const csv = ['Data;Descrição;Valor', '10/10/2026;PIX RECEBIDO - JOAO;50,00', '10/10/2026;PIX RECEBIDO - JOAO;50,00'].join('\n');
    const a = parseStatement(csv);
    const b = parseStatement(csv);
    expect(a.pix.map((p) => p.externalId)).toEqual(b.pix.map((p) => p.externalId));
    expect(new Set(a.pix.map((p) => p.externalId)).size).toBe(2);
  });
});
