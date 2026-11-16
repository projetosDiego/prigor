/**
 * Pedidos que chegam do site oficial (cardápio de Natal) — regras puras.
 *
 * O site calcula o pedido para mostrar ao cliente; aqui o ERP refaz a conta a
 * partir de quantidade, preço unitário e % de desconto de cada linha e só
 * aceita se o total bater ao centavo com o que o cliente viu. Isso pega
 * qualquer divergência de regra entre os dois sistemas antes de gravar.
 */
import { type Decimal } from 'decimal.js';

import { dec, money, percentOf } from './money';
import { calculateOrder, itemGross } from './orders';

export interface SiteOrderLine {
  sku: string;
  name: string;
  option: string;
  quantity: number;
  /** Preço unitário em reais, "75.00" */
  unitPrice: string;
  /** % de desconto da linha (0 ou o desconto por quantidade) */
  discountPct: number;
}

export interface PricedSiteLine extends SiteOrderLine {
  discountItem: Decimal;
  subtotal: Decimal;
}

export type SitePricing =
  | { ok: true; lines: PricedSiteLine[]; subtotal: Decimal; total: Decimal }
  | { ok: false; reason: string };

/** Desconto da linha = bruto × % (2 casas, meio para cima). */
export function lineDiscount(quantity: number, unitPrice: string, discountPct: number): Decimal {
  if (!discountPct) return money(0);
  return percentOf(itemGross(quantity, unitPrice), discountPct);
}

export function priceSiteOrder(lines: SiteOrderLine[], expectedTotal: string): SitePricing {
  if (lines.length === 0) return { ok: false, reason: 'Pedido sem itens.' };
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) return { ok: false, reason: `Quantidade inválida em ${l.name}.` };
    if (dec(l.unitPrice).lessThanOrEqualTo(0)) return { ok: false, reason: `Preço inválido em ${l.name}.` };
    if (l.discountPct < 0 || l.discountPct > 90) return { ok: false, reason: `Desconto inválido em ${l.name}.` };
  }

  const calculated = calculateOrder(
    lines.map((l, i) => ({
      productId: String(i),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountItem: lineDiscount(l.quantity, l.unitPrice, l.discountPct),
    })),
  );

  if (!calculated.total.equals(money(expectedTotal))) {
    return {
      ok: false,
      reason: `Total divergente: o site enviou ${money(expectedTotal).toFixed(2)} e o ERP calculou ${calculated.total.toFixed(2)}.`,
    };
  }

  return {
    ok: true,
    lines: lines.map((l, i) => ({ ...l, discountItem: calculated.items[i]!.discountItem, subtotal: calculated.items[i]!.subtotal })),
    subtotal: calculated.subtotal,
    total: calculated.total,
  };
}

/** Assinatura válida só por alguns minutos (evita reenvio de uma requisição capturada). */
export function isFreshTimestamp(timestampSeconds: string, nowSeconds: number, maxAgeSeconds = 600): boolean {
  const ts = Number(timestampSeconds);
  return Number.isInteger(ts) && Math.abs(nowSeconds - ts) <= maxAgeSeconds;
}

export interface SiteOrderSummaryInput {
  code: string;
  campaign: string;
  fulfillment: { type: 'ENTREGA' | 'RETIRADA'; pickupPoint: string };
  payment: { plan: 'SINAL_50' | 'TOTAL'; method: 'PIX' | 'CARTAO'; amountDue: string };
  lines: SiteOrderLine[];
  customerNotes: string;
}

/** Forma de pagamento como aparece no pedido do ERP. */
export function sitePaymentMethod(method: 'PIX' | 'CARTAO'): string {
  return method === 'PIX' ? 'Pix' : 'Cartão de crédito';
}

/**
 * Observações do pedido: origem, como recebe, pagamento e as escolhas de cada
 * item (recheio/sabor), que não têm campo próprio no item do ERP.
 */
export function siteOrderNotes(input: SiteOrderSummaryInput): string {
  const campaign = input.campaign.replace(/^natal(\d{4})$/, 'Natal $1');
  const receive = input.fulfillment.type === 'RETIRADA' ? `Retirada: ${input.fulfillment.pickupPoint}` : 'Entrega (taxa a combinar)';
  const pay =
    `${input.payment.plan === 'TOTAL' ? 'Pagamento total' : 'Sinal'} ` +
    `R$ ${money(input.payment.amountDue).toFixed(2).replace('.', ',')} via ${sitePaymentMethod(input.payment.method)} — aguardando confirmação`;
  const choices = input.lines
    .filter((l) => l.option)
    .map((l) => `${l.quantity}× ${l.name} (${l.option})`)
    .join('; ');
  return [
    `[Site · ${campaign} · ${input.code}]`,
    receive,
    pay,
    choices ? `Escolhas: ${choices}` : '',
    input.customerNotes ? `Obs. do cliente: ${input.customerNotes}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}
