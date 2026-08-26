/**
 * Regras de movimentação de estoque — lógica pura.
 *
 * Recebe a composição do pedido e o estado atual dos produtos, e devolve a
 * lista de movimentos a aplicar. Quem persiste é o service; aqui só se decide
 * o quê e quanto.
 *
 * Correção importante em relação ao backend Python: lá o estorno e a baixa de
 * insumo liam `ing.ingredient`, um atributo que não existia no modelo
 * (`AttributeError` em tempo de execução). Na prática **a baixa de insumo
 * nunca rodou** — qualquer pedido com produto que tivesse ficha técnica
 * quebrava com erro 500. Aqui a receita é explodida de verdade.
 */
import { Decimal, dec, qty } from './money';

export type StockMovementType =
  | 'baixa_insumo'
  | 'entrada_recheio'
  | 'entrada_produto'
  | 'saida_venda';

export interface RecipeLine {
  /** Insumo consumido. */
  ingredientId: string;
  /** Quantidade do insumo por unidade do produto final. */
  quantity: Decimal | number | string;
}

export interface StockProduct {
  id: string;
  name: string;
  stock: Decimal | number | string;
  trackStock: boolean;
  /** Ficha técnica: vazio quando o produto não é composto. */
  recipe?: RecipeLine[];
}

export interface StockOrderItem {
  productId: string;
  quantity: Decimal | number | string;
}

export interface PlannedMovement {
  productId: string;
  type: StockMovementType;
  /** Sempre positiva: o sinal está no `type`. */
  quantity: Decimal;
  stockBefore: Decimal;
  stockAfter: Decimal;
  observation: string;
}

export type StockDirection = 'consume' | 'restore';

/**
 * Planeja os movimentos de um pedido.
 *
 * `consume` baixa produto acabado (`saida_venda`) e insumos da receita
 * (`baixa_insumo`). `restore` devolve tudo (`entrada_produto` e
 * `entrada_recheio`).
 *
 * Produtos com `trackStock: false` são ignorados. Um insumo usado por vários
 * itens do mesmo pedido acumula corretamente, porque o saldo é atualizado a
 * cada passo dentro do próprio planejamento.
 */
export function planOrderStockMovements(params: {
  orderNumber: number;
  items: StockOrderItem[];
  products: Map<string, StockProduct>;
  direction: StockDirection;
}): PlannedMovement[] {
  const { orderNumber, items, products, direction } = params;
  const consuming = direction === 'consume';
  const movements: PlannedMovement[] = [];

  // Saldo corrente em memória, para que múltiplos itens sobre o mesmo produto
  // ou insumo encadeiem corretamente.
  const running = new Map<string, Decimal>();
  const balanceOf = (product: StockProduct): Decimal =>
    running.get(product.id) ?? qty(product.stock);

  const apply = (
    product: StockProduct,
    amount: Decimal,
    type: StockMovementType,
    observation: string,
  ): void => {
    if (!product.trackStock) return;
    if (amount.isZero()) return;

    const before = balanceOf(product);
    const after = qty(consuming ? before.minus(amount) : before.plus(amount));
    running.set(product.id, after);

    movements.push({
      productId: product.id,
      type,
      quantity: qty(amount),
      stockBefore: before,
      stockAfter: after,
      observation,
    });
  };

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product) continue;

    const quantity = qty(item.quantity);
    if (quantity.isZero()) continue;

    apply(
      product,
      quantity,
      consuming ? 'saida_venda' : 'entrada_produto',
      consuming
        ? `Baixa automática por venda do pedido #${orderNumber}`
        : `Estorno automático do pedido #${orderNumber}`,
    );

    for (const line of product.recipe ?? []) {
      const ingredient = products.get(line.ingredientId);
      if (!ingredient) continue;

      const consumption = qty(dec(quantity).times(dec(line.quantity)));
      apply(
        ingredient,
        consumption,
        consuming ? 'baixa_insumo' : 'entrada_recheio',
        consuming
          ? `Consumo automático no pedido #${orderNumber} (produto: ${product.name})`
          : `Estorno de insumo do pedido #${orderNumber} (produto: ${product.name})`,
      );
    }
  }

  return movements;
}

/** Movimento avulso do scanner de produção. */
export function planManualMovement(params: {
  product: StockProduct;
  type: StockMovementType;
  quantity: Decimal | number | string;
  observation?: string | null;
}): PlannedMovement {
  const { product, type } = params;
  const amount = qty(params.quantity);
  const isOutbound = type === 'baixa_insumo' || type === 'saida_venda';

  const before = qty(product.stock);
  const after = qty(isOutbound ? before.minus(amount) : before.plus(amount));

  return {
    productId: product.id,
    type,
    quantity: amount,
    stockBefore: before,
    stockAfter: after,
    observation: params.observation ?? '',
  };
}

/**
 * Custo de um produto a partir da ficha técnica.
 * Um único nível: produto → insumos diretos, como no sistema atual.
 */
export function calculateRecipeCost(
  recipe: RecipeLine[],
  ingredientCosts: Map<string, Decimal | number | string>,
): Decimal {
  return recipe.reduce<Decimal>((total, line) => {
    const unitCost = ingredientCosts.get(line.ingredientId);
    if (unitCost === undefined) return total;
    return total.plus(dec(unitCost).times(dec(line.quantity)));
  }, dec(0));
}
