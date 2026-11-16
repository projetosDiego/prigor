/**
 * Regras de preço do pedido — funções puras, sem I/O. Tudo em centavos.
 *
 *  - Desconto por volume: a partir de `bulkQty` unidades do MESMO produto
 *    (somando recheios/sabores), cada linha daquele produto ganha `bulkPct`%.
 *  - Itens do canal "empresa" já têm preço especial: não recebem o desconto
 *    por volume e precisam respeitar a quantidade mínima.
 *  - Sinal: `depositPct`% do total, arredondado para cima no centavo.
 *
 * O mesmo cálculo é refeito no ERP antes de gravar o pedido.
 */
import type { NatalItem } from './catalog';

export type CartLineInput = { sku: string; option?: string; quantity: number };

export type PricedLine = {
  sku: string;
  name: string;
  option: string;
  channel: NatalItem['channel'];
  quantity: number;
  unitCents: number;
  grossCents: number;
  discountPct: number;
  discountCents: number;
  totalCents: number;
};

export type PricingRules = { bulkQty: number; bulkPct: number };

export type PricedCart = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  errors: string[];
  /** true quando há item do canal empresa (exige CNPJ) */
  hasCorporate: boolean;
};

export const MAX_QTY_PER_LINE = 500;

/** Arredondamento comercial (meio para cima) de uma fração de centavos. */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5 + 1e-9);
}

export function priceCart(input: CartLineInput[], catalog: NatalItem[], rules: PricingRules): PricedCart {
  const bySku = new Map(catalog.map((i) => [i.sku, i]));
  const errors: string[] = [];
  const merged = new Map<string, CartLineInput>();

  for (const raw of input) {
    const item = bySku.get(raw.sku);
    if (!item || !item.active) {
      errors.push('Um dos produtos do carrinho não está mais disponível.');
      continue;
    }
    const quantity = Math.floor(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) continue;
    let option = (raw.option ?? '').trim();
    if (item.option) {
      if (!item.option.values.includes(option)) {
        errors.push(`Escolha ${item.option.label.toLowerCase()} para ${item.name}.`);
        continue;
      }
    } else {
      option = '';
    }
    const key = `${item.sku}|${option}`;
    const prev = merged.get(key);
    merged.set(key, { sku: item.sku, option, quantity: Math.min(MAX_QTY_PER_LINE, (prev?.quantity ?? 0) + quantity) });
  }

  const qtyBySku = new Map<string, number>();
  for (const l of merged.values()) qtyBySku.set(l.sku, (qtyBySku.get(l.sku) ?? 0) + l.quantity);

  const lines: PricedLine[] = [];
  for (const l of merged.values()) {
    const item = bySku.get(l.sku)!;
    const skuQty = qtyBySku.get(l.sku) ?? 0;
    const gross = item.priceCents * l.quantity;
    const pct = item.channel === 'varejo' && rules.bulkPct > 0 && skuQty >= rules.bulkQty ? rules.bulkPct : 0;
    const discount = pct ? roundHalfUp((gross * pct) / 100) : 0;
    lines.push({
      sku: item.sku,
      name: item.name,
      option: l.option ?? '',
      channel: item.channel,
      quantity: l.quantity,
      unitCents: item.priceCents,
      grossCents: gross,
      discountPct: pct,
      discountCents: discount,
      totalCents: gross - discount,
    });
  }

  for (const [sku, qty] of qtyBySku) {
    const item = bySku.get(sku)!;
    if (item.minQty && qty < item.minQty) errors.push(`${item.name}: pedido mínimo de ${item.minQty} unidades.`);
  }

  const subtotal = lines.reduce((s, l) => s + l.grossCents, 0);
  const discount = lines.reduce((s, l) => s + l.discountCents, 0);
  return {
    lines,
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: subtotal - discount,
    errors: [...new Set(errors)],
    hasCorporate: lines.some((l) => l.channel === 'empresa'),
  };
}

/** Valor a pagar agora: sinal (arredondado para cima) ou total. */
export function amountDue(totalCents: number, plan: 'SINAL_50' | 'TOTAL', depositPct: number): number {
  if (plan === 'TOTAL') return totalCents;
  return Math.ceil((totalCents * depositPct) / 100);
}

/** Quanto falta para o próximo desconto por volume num produto (null se não se aplica). */
export function missingForBulk(item: NatalItem, qtyInCart: number, rules: PricingRules): number | null {
  if (item.channel !== 'varejo' || rules.bulkPct <= 0) return null;
  if (qtyInCart >= rules.bulkQty) return 0;
  return rules.bulkQty - qtyInCart;
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
