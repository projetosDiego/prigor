/**
 * Regras puras do relatório por CNPJ (sem banco): somatórios e limite anual.
 */
export interface DocLine {
  issuerId: string | null;
  value: number;
}

export function sumBy<T extends DocLine>(rows: T[], pred: (r: T) => boolean): { count: number; total: number } {
  let count = 0;
  let cents = 0;
  for (const r of rows) {
    if (!pred(r)) continue;
    count += 1;
    cents += Math.round(r.value * 100);
  }
  return { count, total: cents / 100 };
}

export type LimitLevel = 'ok' | 'atencao' | 'critico' | 'estourado';

/** Situação frente ao limite anual: atenção a partir de 80%, crítico a partir de 95%. */
export function limitStatus(used: number, limit: number): { pct: number; level: LimitLevel; remaining: number } {
  if (!(limit > 0)) return { pct: 0, level: 'ok', remaining: 0 };
  const pct = Math.round((used / limit) * 1000) / 10;
  const remaining = Math.round((limit - used) * 100) / 100;
  const level: LimitLevel = used > limit ? 'estourado' : pct >= 95 ? 'critico' : pct >= 80 ? 'atencao' : 'ok';
  return { pct, level, remaining };
}

/** Projeção linear do ano: faturado até hoje ÷ dias passados × dias do ano. */
export function yearProjection(used: number, today: Date): number {
  const y = today.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const days = Math.max(1, Math.floor((today.getTime() - start) / 86_400_000) + 1);
  const total = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
  return Math.round((used / days) * total * 100) / 100;
}

/** CSV para Excel brasileiro: separador ';', vírgula decimal, BOM UTF-8. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
