import { onlyDigits } from './text';

/** Número no formato internacional (55 + DDD + número). */
export function waNumber(raw: string): string {
  const d = onlyDigits(raw);
  if (!d) return '';
  return d.length <= 11 ? `55${d}` : d;
}

export function waLink(number: string, message?: string): string {
  const n = waNumber(number);
  if (!n) return '';
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${n}${text}`;
}

/** Substitui {chave} pelos valores fornecidos. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}
