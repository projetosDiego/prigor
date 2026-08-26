/**
 * Regras de cálculo do pedido: subtotal, total e comissão.
 *
 * Lógica pura e sem dependência de banco — é o núcleo financeiro do sistema e
 * precisa ser testável linha a linha.
 *
 * Mudanças conscientes em relação ao backend Python anterior (ver
 * docs/DECISOES.md):
 *  1. Arredondamento HALF_UP em vez de banker's rounding.
 *  2. A comissão deixa de incidir sobre frete e outros custos. Antes o cálculo
 *     usava `fator = total / subtotal`, e como o total inclui frete, o
 *     vendedor recebia comissão sobre entrega. Agora a base é
 *     `subtotal - desconto`.
 *  3. Subtotal de item e total do pedido não podem ficar negativos.
 */
import { Decimal, dec, money, notNegative, percentOf, sumMoney } from './money';

export type OrderStatus =
  | 'novo'
  | 'confirmado'
  | 'em_producao'
  | 'entregue'
  | 'faturado'
  | 'cancelado';

/** Status em que o pedido consome estoque. */
export const STOCK_ACTIVE_STATUSES: readonly OrderStatus[] = [
  'confirmado',
  'em_producao',
  'entregue',
  'faturado',
];

/** Status em que o pedido gera conta a receber. */
export const RECEIVABLE_STATUSES: readonly OrderStatus[] = [
  'confirmado',
  'entregue',
  'faturado',
];

/** Status em que a comissão do vendedor vira conta a pagar. */
export const COMMISSION_PAYABLE_STATUSES: readonly OrderStatus[] = ['faturado'];

export function movesStock(status: OrderStatus): boolean {
  return STOCK_ACTIVE_STATUSES.includes(status);
}

export function generatesReceivable(status: OrderStatus): boolean {
  return RECEIVABLE_STATUSES.includes(status);
}

export function generatesCommissionPayable(status: OrderStatus): boolean {
  return COMMISSION_PAYABLE_STATUSES.includes(status);
}

export interface OrderItemInput {
  productId: string;
  quantity: Decimal | number | string;
  unitPrice: Decimal | number | string;
  discountItem?: Decimal | number | string | null;
  /** Percentual de comissão do produto; `null` herda o do vendedor. */
  productCommissionPct?: Decimal | number | string | null;
}

export interface OrderChargesInput {
  discount?: Decimal | number | string | null;
  shipping?: Decimal | number | string | null;
  otherCosts?: Decimal | number | string | null;
  /** Percentual do vendedor; `null` quando o pedido não tem vendedor. */
  sellerCommissionPct?: Decimal | number | string | null;
}

export interface CalculatedItem {
  productId: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discountItem: Decimal;
  subtotal: Decimal;
  commission: Decimal;
}

export interface CalculatedOrder {
  items: CalculatedItem[];
  subtotal: Decimal;
  discount: Decimal;
  shipping: Decimal;
  otherCosts: Decimal;
  total: Decimal;
  commissionVal: Decimal;
}

/** Valor bruto de um item, antes do desconto de item. */
export function itemGross(
  quantity: Decimal | number | string,
  unitPrice: Decimal | number | string,
): Decimal {
  return money(dec(quantity).times(dec(unitPrice)));
}

/**
 * Calcula um pedido inteiro.
 *
 * Ordem das operações (importante para reprodutibilidade):
 *  1. Cada item: `bruto = round(qtd * preço)`, `subtotal = max(0, bruto - desconto_item)`.
 *  2. Subtotal do pedido = soma dos subtotais já arredondados.
 *  3. Base de comissão = `max(0, subtotal - desconto do pedido)`.
 *  4. Comissão de cada item = `round(subtotal_item * pct / 100)`, rateada pela
 *     proporção entre a base de comissão e o subtotal.
 *  5. Total = `max(0, subtotal - desconto) + frete + outros custos`.
 */
export function calculateOrder(
  items: OrderItemInput[],
  charges: OrderChargesInput = {},
): CalculatedOrder {
  const discount = money(charges.discount ?? 0);
  const shipping = money(charges.shipping ?? 0);
  const otherCosts = money(charges.otherCosts ?? 0);
  const hasSeller =
    charges.sellerCommissionPct !== null && charges.sellerCommissionPct !== undefined;
  const sellerPct = dec(charges.sellerCommissionPct ?? 0);

  const calculated: CalculatedItem[] = items.map((item) => {
    const quantity = dec(item.quantity);
    const unitPrice = money(item.unitPrice);
    const discountItem = money(item.discountItem ?? 0);
    const gross = itemGross(quantity, unitPrice);
    const subtotal = notNegative(money(gross.minus(discountItem)));

    // `0` explícito no produto vence e zera a comissão daquele item; só
    // `null`/`undefined` herda o percentual do vendedor.
    const pct =
      item.productCommissionPct === null || item.productCommissionPct === undefined
        ? sellerPct
        : dec(item.productCommissionPct);

    const commission = hasSeller ? percentOf(subtotal, pct) : money(0);

    return { productId: item.productId, quantity, unitPrice, discountItem, subtotal, commission };
  });

  const subtotal = sumMoney(calculated.map((i) => i.subtotal));

  // Desconto do pedido nunca ultrapassa o subtotal.
  const effectiveDiscount = discount.greaterThan(subtotal) ? subtotal : discount;
  const commissionBase = notNegative(money(subtotal.minus(effectiveDiscount)));

  const total = money(commissionBase.plus(shipping).plus(otherCosts));

  let commissionVal = money(0);
  if (hasSeller && subtotal.greaterThan(0)) {
    const rawCommission = sumMoney(calculated.map((i) => i.commission));
    // Rateia o desconto do pedido proporcionalmente. Frete e outros custos
    // ficam de fora: não se paga comissão sobre entrega.
    const factor = commissionBase.dividedBy(subtotal);
    commissionVal = notNegative(money(rawCommission.times(factor)));
  }

  return {
    items: calculated,
    subtotal,
    discount: effectiveDiscount,
    shipping,
    otherCosts,
    total,
    commissionVal,
  };
}
