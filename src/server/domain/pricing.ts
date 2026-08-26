/**
 * Escolha do preço unitário de um item de pedido.
 *
 * Lógica pura: recebe dados simples e devolve o preço. Nenhum acesso a banco,
 * o que torna a regra testável e auditável isoladamente.
 */
import { Decimal, dec, gt, gte, money } from './money';

export interface PricingProduct {
  salePrice: Decimal | number | string;
  wholesalePrice: Decimal | number | string;
  minWholesaleQty: Decimal | number | string;
}

export interface PricingCustomer {
  isReseller: boolean;
}

/**
 * Ordem de decisão (mantida do sistema anterior, agora explícita e testada):
 *  1. Cliente revendedor e produto com preço de atacado > 0 → atacado.
 *  2. Quantidade atinge a quantidade mínima de atacado (> 0) e há preço de
 *     atacado > 0 → atacado.
 *  3. Caso contrário → preço de venda.
 */
export function resolveUnitPrice(
  product: PricingProduct,
  quantity: Decimal | number | string,
  customer: PricingCustomer | null,
): Decimal {
  const wholesale = dec(product.wholesalePrice);
  const minQty = dec(product.minWholesaleQty);
  const hasWholesale = gt(wholesale, 0);

  if (customer?.isReseller && hasWholesale) return money(wholesale);
  if (hasWholesale && gt(minQty, 0) && gte(quantity, minQty)) return money(wholesale);

  return money(product.salePrice);
}
