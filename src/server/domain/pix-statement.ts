/**
 * Leitura de extrato bancário (OFX ou CSV) para achar os Pix recebidos (pura, sem banco).
 * Só entram créditos cuja descrição fala em PIX.
 */
import { createHash } from 'node:crypto';

export interface StatementPix {
  externalId: string;
  /** AAAA-MM-DD */
  date: string;
  value: number;
  payerName: string | null;
  payerDocument: string | null;
  description: string;
}

export interface StatementParseResult {
  format: 'ofx' | 'csv';
  pix: StatementPix[];
  /** Linhas lidas que não eram Pix recebido (débitos, TED, tarifas…). */
  ignored: number;
}

/** Tira o rótulo ("PIX RECEBIDO - ") e devolve o nome de quem pagou. */
export function extractPayer(description: string): { name: string | null; document: string | null } {
  const text = description.replace(/\s+/g, ' ').trim();
  const doc = text.match(/(?<!\d)(\d{14}|\d{11})(?!\d)/)?.[1] ?? null;
  const afterPix = text.replace(/^.*?\bPIX\b\s*(?:RECEBIDO|RECEBIMENTO|RECEB\.?|REC\.?|CR[EÉ]D\.?|CR[EÉ]DITO|QR\s*CODE|TRANSF\.?)?\s*/i, '');
  const name = afterPix
    .replace(/^(?:REM(?:ETENTE)?|DE|DE:|NOME)\s*[:\-]?\s*/i, '')
    .replace(/^[\s\-:/–]+/, '')
    .replace(/(?<!\d)[\d.\-/*]{9,}(?!\d)/g, ' ') // CPF/CNPJ (inclusive mascarado)
    .replace(/\b(?:CPF|CNPJ|CHAVE|END2END|E2E|ID)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return { name: /[A-Za-zÀ-ú]{2}/.test(name) ? name : null, document: doc };
}

function hash(key: string): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 24);
}

/** "1.234,56" | "1234.56" | "1.234,56C" | "-10,00" → número (null se não for dinheiro). */
export function parseMoney(raw: string): { value: number; credit: boolean } | null {
  const s = raw.trim().replace(/^R\$\s*/i, '');
  const m = s.match(/^(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+[.,]\d{1,2}|\d+)\s*([CDcd])?$/);
  if (!m) return null;
  const num = m[2]!;
  const normalized = num.includes(',') ? num.replace(/\./g, '').replace(',', '.') : num;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const negative = !!m[1] || (m[3] ?? '').toLowerCase() === 'd';
  return { value: Math.abs(value), credit: !negative };
}

function isoFromBr(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const i = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return i ? `${i[1]}-${i[2]}-${i[3]}` : null;
}

// ─── OFX ─────────────────────────────────────────────────────────────────────

function ofxTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'));
  return m ? m[1]!.trim() : null;
}

function parseOfx(text: string): StatementParseResult {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const pix: StatementPix[] = [];
  let ignored = 0;
  const seen = new Map<string, number>();
  for (const block of blocks) {
    const amount = ofxTag(block, 'TRNAMT');
    const posted = ofxTag(block, 'DTPOSTED');
    const memo = [ofxTag(block, 'MEMO'), ofxTag(block, 'NAME')].filter(Boolean).join(' ').trim();
    const value = amount ? Number(amount.replace(',', '.')) : NaN;
    if (!(value > 0) || !/pix/i.test(memo) || !posted || posted.length < 8) {
      ignored += 1;
      continue;
    }
    const date = `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`;
    const fitid = ofxTag(block, 'FITID');
    const payer = extractPayer(memo);
    let externalId = fitid ? `ofx:${fitid}` : '';
    if (!externalId) {
      const key = `${date}|${value.toFixed(2)}|${memo}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      externalId = `ofx:${hash(`${key}#${n}`)}`;
    }
    pix.push({ externalId, date, value, payerName: payer.name, payerDocument: payer.document, description: memo });
  }
  return { format: 'ofx', pix, ignored };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string): StatementParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = (lines.slice(0, 20).join('\n').match(/;/g)?.length ?? 0) >= (lines.slice(0, 20).join('\n').match(/,/g)?.length ?? 0) / 3 && lines.some((l) => l.includes(';')) ? ';' : ',';
  let valueCol = -1;
  let typeCol = -1;
  const pix: StatementPix[] = [];
  let ignored = 0;
  const seen = new Map<string, number>();

  for (const line of lines) {
    const cells = splitLine(line, delimiter);
    const lower = cells.map((c) => c.toLowerCase());
    // Cabeçalho: descobre a coluna do valor (e do tipo, se houver) para não confundir com o saldo.
    if (valueCol < 0 && lower.some((c) => /^(valor|cr[eé]dito|valor \(r\$\))/.test(c)) && lower.some((c) => /(data|hist|descri|lan[cç])/.test(c))) {
      valueCol = lower.findIndex((c) => /^(valor|cr[eé]dito|valor \(r\$\))/.test(c));
      typeCol = lower.findIndex((c) => /^(tipo|d\/c|natureza)/.test(c));
      continue;
    }
    const date = cells.map(isoFromBr).find(Boolean) ?? null;
    if (!date) continue;
    const moneyCells = cells.map((c, i) => ({ i, m: parseMoney(c) })).filter((x) => x.m && /[.,]\d{1,2}|\d/.test(cells[x.i]!) && !/^\d{2}\/\d{2}\/\d{4}$/.test(cells[x.i]!));
    const chosen = valueCol >= 0 ? moneyCells.find((x) => x.i === valueCol) : moneyCells[0];
    if (!chosen?.m) {
      ignored += 1;
      continue;
    }
    const typeText = typeCol >= 0 ? (lower[typeCol] ?? '') : '';
    const debitByType = /^(d|d[eé]bito|saida|sa[ií]da)$/.test(typeText);
    const description = cells.filter((c, i) => i !== chosen.i && !isoFromBr(c) && /[A-Za-zÀ-ú]{3}/.test(c) && !parseMoney(c)).join(' ').trim();
    if (!chosen.m.credit || debitByType || !/pix/i.test(description) || !(chosen.m.value > 0)) {
      ignored += 1;
      continue;
    }
    const payer = extractPayer(description);
    const key = `${date}|${chosen.m.value.toFixed(2)}|${description}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    pix.push({ externalId: `csv:${hash(`${key}#${n}`)}`, date, value: chosen.m.value, payerName: payer.name, payerDocument: payer.document, description });
  }
  return { format: 'csv', pix, ignored };
}

export function parseStatement(text: string): StatementParseResult {
  const clean = text.replace(/^﻿/, '');
  return /<STMTTRN>/i.test(clean) ? parseOfx(clean) : parseCsv(clean);
}
