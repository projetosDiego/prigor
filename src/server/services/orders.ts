/**
 * Pedidos: criação, alteração, cancelamento.
 *
 * Tudo que um pedido dispara — cálculo, estoque e financeiro — acontece dentro
 * de uma única transação. Antes, um erro no meio do caminho podia deixar o
 * estoque baixado sem o lançamento correspondente.
 */
import { calculateOrder, movesStock, type OrderStatus } from '../domain/orders';
import { planOrderStockMovements, type StockProduct } from '../domain/stock';
import { resolveUnitPrice } from '../domain/pricing';
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import { isManagement, sellerScope, type SessionPayload } from '../auth/guard';
import { syncOrderFinancials } from './financial-sync';
import { paginated, toOrderDTO, type OrderDTO, type Paginated } from './serializers';
import type { OrderCreateInput, OrderUpdateInput } from '../validation/sales';
import type { Tx } from '../tx';

const ORDER_INCLUDE = {
  customer: {
    select: {
      tradeName: true,
      address: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      latitude: true,
      longitude: true,
      phone: true,
      mobile: true,
      isReseller: true,
    },
  },
  seller: { select: { name: true, commissionPct: true } },
  items: {
    include: { product: { select: { name: true } } },
    orderBy: { id: 'asc' as const },
  },
};

export interface ListOrdersParams {
  status?: OrderStatus[];
  customerId?: string | null;
  sellerId?: string | null;
  from?: Date | null;
  to?: Date | null;
  deliveryFrom?: Date | null;
  deliveryTo?: Date | null;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listOrders(
  session: SessionPayload,
  params: ListOrdersParams,
): Promise<Paginated<OrderDTO>> {
  const where: Record<string, unknown> = {};

  // Vendedor só enxerga a própria carteira. Antes, a tela "Meus Pedidos"
  // listava os pedidos de todos os vendedores.
  const scope = sellerScope(session);
  if (scope.sellerId) where.sellerId = scope.sellerId;
  else if (params.sellerId) where.sellerId = params.sellerId;

  if (params.status?.length) where.status = { in: params.status };
  if (params.customerId) where.customerId = params.customerId;

  if (params.from || params.to) {
    where.orderDate = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }

  if (params.deliveryFrom || params.deliveryTo) {
    where.deliveryDate = {
      ...(params.deliveryFrom ? { gte: params.deliveryFrom } : {}),
      ...(params.deliveryTo ? { lte: params.deliveryTo } : {}),
    };
  }

  if (params.search) {
    const asNumber = Number(params.search);
    where.OR = [
      { customer: { tradeName: { contains: params.search, mode: 'insensitive' } } },
      ...(Number.isInteger(asNumber) ? [{ numero: asNumber }] : []),
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { numero: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return paginated(
    rows.map((row: never) => toOrderDTO(row, { withAddress: true })),
    total,
    params.page,
    params.pageSize,
  );
}

export async function getOrder(session: SessionPayload, id: string): Promise<OrderDTO> {
  const row = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!row) throw notFound('Pedido');

  if (!isManagement(session) && row.sellerId !== session.sellerId) {
    throw notFound('Pedido');
  }

  return toOrderDTO(row, { withAddress: true });
}

interface PricingContext {
  products: Map<string, StockProduct & {
    salePrice: string;
    wholesalePrice: string;
    minWholesaleQty: string;
    commissionPct: string | null;
    active: boolean;
  }>;
  isReseller: boolean;
}

/** Carrega produtos do pedido junto com a ficha técnica dos itens. */
async function loadPricingContext(
  tx: Tx,
  productIds: string[],
  customerId: string,
): Promise<PricingContext> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true, isReseller: true, active: true },
  });
  if (!customer) throw badRequest('Cliente inválido.');
  if (!customer.active) throw badRequest('Este cliente está arquivado.');

  const direct = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { ingredients: { select: { ingredientId: true, quantity: true } } },
  });

  if (direct.length !== new Set(productIds).size) {
    const found = new Set(direct.map((p: { id: string }) => p.id));
    const missing = productIds.find((id) => !found.has(id));
    throw badRequest(`Produto ${missing} inválido.`);
  }

  const inactive = direct.find((p: { active: boolean }) => !p.active);
  if (inactive) throw badRequest(`O produto "${inactive.name}" está arquivado.`);

  // Insumos das fichas técnicas, para o planejamento de estoque.
  const ingredientIds = [
    ...new Set(
      direct.flatMap((p: { ingredients: Array<{ ingredientId: string }> }) =>
        p.ingredients.map((i) => i.ingredientId),
      ),
    ),
  ].filter((id) => !productIds.includes(id as string)) as string[];

  const ingredients = ingredientIds.length
    ? await tx.product.findMany({
        where: { id: { in: ingredientIds } },
        include: { ingredients: { select: { ingredientId: true, quantity: true } } },
      })
    : [];

  const products = new Map<string, never>();
  for (const row of [...direct, ...ingredients]) {
    products.set(row.id, {
      id: row.id,
      name: row.name,
      stock: String(row.stock),
      trackStock: row.trackStock,
      recipe: row.ingredients.map((line: { ingredientId: string; quantity: unknown }) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
      })),
      salePrice: String(row.salePrice),
      wholesalePrice: String(row.wholesalePrice),
      minWholesaleQty: String(row.minWholesaleQty),
      commissionPct: row.commissionPct === null ? null : String(row.commissionPct),
      active: row.active,
    } as never);
  }

  return { products: products as never, isReseller: customer.isReseller };
}

/** Aplica os movimentos planejados: grava histórico e atualiza o saldo. */
async function applyStock(
  tx: Tx,
  orderId: string,
  orderNumber: number,
  items: Array<{ productId: string; quantity: string }>,
  products: PricingContext['products'],
  direction: 'consume' | 'restore',
): Promise<void> {
  const movements = planOrderStockMovements({
    orderNumber,
    items,
    products: products as never,
    direction,
  });

  for (const movement of movements) {
    await tx.stockMovement.create({
      data: {
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity.toFixed(3),
        stockBefore: movement.stockBefore.toFixed(3),
        stockAfter: movement.stockAfter.toFixed(3),
        orderId,
        observation: movement.observation,
      },
    });
    await tx.product.update({
      where: { id: movement.productId },
      data: { stock: movement.stockAfter.toFixed(3) },
    });
  }
}

/** Vendedor efetivo do pedido: gestão escolhe, vendedor é sempre ele mesmo. */
function resolveSellerId(session: SessionPayload, requested: string | null | undefined): string | null {
  if (!isManagement(session)) {
    // Corrige o comportamento antigo: a tela do vendedor não mandava
    // `vendedor_id`, e todo pedido de campo ficava sem vendedor — logo, sem
    // comissão.
    return session.sellerId;
  }
  return requested ?? null;
}

export async function createOrder(
  session: SessionPayload,
  input: OrderCreateInput,
): Promise<OrderDTO> {
  const sellerId = resolveSellerId(session, input.sellerId);

  const created = await prisma.$transaction(async (tx: Tx) => {
    const productIds = input.items.map((item) => item.productId);
    const context = await loadPricingContext(tx, productIds, input.customerId);

    const seller = sellerId
      ? await tx.seller.findUnique({ where: { id: sellerId }, select: { id: true, commissionPct: true, active: true } })
      : null;

    if (sellerId && !seller) throw badRequest('Vendedor inválido.');
    if (seller && !seller.active) throw badRequest('Este vendedor está inativo.');

    const items = input.items.map((item) => {
      const product = context.products.get(item.productId)!;
      const unitPrice =
        item.unitPrice ??
        resolveUnitPrice(product, item.quantity, { isReseller: context.isReseller }).toFixed(2);

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        discountItem: item.discountItem,
        productCommissionPct: product.commissionPct,
      };
    });

    const calculated = calculateOrder(items, {
      discount: input.discount,
      shipping: input.shipping,
      otherCosts: input.otherCosts,
      sellerCommissionPct: seller ? String(seller.commissionPct) : null,
    });

    const order = await tx.order.create({
      data: {
        customerId: input.customerId,
        sellerId,
        status: input.status,
        paymentMethod: input.paymentMethod,
        orderDate: input.orderDate,
        deliveryDate: input.deliveryDate,
        billingDate: input.billingDate,
        dueDate: input.dueDate,
        discount: calculated.discount.toFixed(2),
        shipping: calculated.shipping.toFixed(2),
        otherCosts: calculated.otherCosts.toFixed(2),
        subtotal: calculated.subtotal.toFixed(2),
        total: calculated.total.toFixed(2),
        commissionVal: calculated.commissionVal.toFixed(2),
        notes: input.notes,
        items: {
          create: calculated.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity.toFixed(3),
            unitPrice: item.unitPrice.toFixed(2),
            discountItem: item.discountItem.toFixed(2),
            subtotal: item.subtotal.toFixed(2),
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    if (movesStock(input.status)) {
      await applyStock(
        tx,
        order.id,
        order.numero,
        calculated.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toFixed(3) })),
        context.products,
        'consume',
      );
    }

    await syncOrderFinancials(tx, {
      id: order.id,
      numero: order.numero,
      status: input.status,
      total: calculated.total.toFixed(2),
      commissionVal: calculated.commissionVal.toFixed(2),
      orderDate: input.orderDate,
      dueDate: input.dueDate,
      sellerId,
      customerName: order.customer?.tradeName ?? 'cliente',
      sellerName: order.seller?.name ?? null,
    });

    return tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
  });

  return toOrderDTO(created, { withAddress: true });
}

export async function updateOrder(
  session: SessionPayload,
  id: string,
  input: OrderUpdateInput,
): Promise<OrderDTO> {
  const updated = await prisma.$transaction(async (tx: Tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      include: {
        items: { select: { productId: true, quantity: true } },
        customer: { select: { tradeName: true, isReseller: true } },
        seller: { select: { name: true, commissionPct: true } },
      },
    });
    if (!current) throw notFound('Pedido');

    if (!isManagement(session) && current.sellerId !== session.sellerId) {
      throw notFound('Pedido');
    }

    if (current.status === 'cancelado' && input.status && input.status !== 'cancelado') {
      throw conflict('Pedido cancelado não pode ser reaberto. Crie um novo pedido.');
    }

    const nextStatus: OrderStatus = input.status ?? (current.status as OrderStatus);
    const customerId = input.customerId ?? current.customerId;
    const sellerId =
      input.sellerId !== undefined ? resolveSellerId(session, input.sellerId) : current.sellerId;

    const itemsProvided = input.items !== undefined;
    const sourceItems = itemsProvided
      ? input.items!
      : current.items.map((item: { productId: string; quantity: unknown }) => ({
          productId: item.productId,
          quantity: String(item.quantity),
          unitPrice: null,
          discountItem: '0.00',
        }));

    const productIds = [
      ...new Set([
        ...sourceItems.map((i: { productId: string }) => i.productId),
        ...current.items.map((i: { productId: string }) => i.productId),
      ]),
    ];
    const context = await loadPricingContext(tx, productIds, customerId);

    // Estorna o estoque do estado anterior antes de recalcular.
    if (movesStock(current.status as OrderStatus)) {
      await applyStock(
        tx,
        current.id,
        current.numero,
        current.items.map((i: { productId: string; quantity: unknown }) => ({
          productId: i.productId,
          quantity: String(i.quantity),
        })),
        context.products,
        'restore',
      );
      // Recarrega saldos após o estorno para o novo planejamento partir do
      // valor correto.
      await refreshStock(tx, context.products);
    }

    const seller = sellerId
      ? await tx.seller.findUnique({ where: { id: sellerId }, select: { id: true, name: true, commissionPct: true, active: true } })
      : null;
    if (sellerId && !seller) throw badRequest('Vendedor inválido.');

    const existingItems = itemsProvided
      ? null
      : await tx.orderItem.findMany({
          where: { orderId: id },
          select: { productId: true, quantity: true, unitPrice: true, discountItem: true },
        });

    const items = (
      itemsProvided
        ? input.items!.map((item) => {
            const product = context.products.get(item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              unitPrice:
                item.unitPrice ??
                resolveUnitPrice(product, item.quantity, { isReseller: context.isReseller }).toFixed(2),
              discountItem: item.discountItem,
              productCommissionPct: product.commissionPct,
            };
          })
        : existingItems!.map((item: { productId: string; quantity: unknown; unitPrice: unknown; discountItem: unknown }) => ({
            productId: item.productId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
            discountItem: String(item.discountItem),
            productCommissionPct: context.products.get(item.productId)?.commissionPct ?? null,
          }))
    );

    const calculated = calculateOrder(items, {
      discount: input.discount ?? String(current.discount),
      shipping: input.shipping ?? String(current.shipping),
      otherCosts: input.otherCosts ?? String(current.otherCosts),
      sellerCommissionPct: seller ? String(seller.commissionPct) : null,
    });

    if (itemsProvided) {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({
        data: calculated.items.map((item) => ({
          orderId: id,
          productId: item.productId,
          quantity: item.quantity.toFixed(3),
          unitPrice: item.unitPrice.toFixed(2),
          discountItem: item.discountItem.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        })),
      });
    }

    const orderDate = input.orderDate ?? current.orderDate;
    const dueDate = input.dueDate !== undefined ? input.dueDate : current.dueDate;

    await tx.order.update({
      where: { id },
      data: {
        customerId,
        sellerId,
        status: nextStatus,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        orderDate,
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
        ...(input.billingDate !== undefined ? { billingDate: input.billingDate } : {}),
        dueDate,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        discount: calculated.discount.toFixed(2),
        shipping: calculated.shipping.toFixed(2),
        otherCosts: calculated.otherCosts.toFixed(2),
        subtotal: calculated.subtotal.toFixed(2),
        total: calculated.total.toFixed(2),
        commissionVal: calculated.commissionVal.toFixed(2),
      },
    });

    if (movesStock(nextStatus)) {
      await applyStock(
        tx,
        id,
        current.numero,
        calculated.items.map((i) => ({ productId: i.productId, quantity: i.quantity.toFixed(3) })),
        context.products,
        'consume',
      );
    }

    await syncOrderFinancials(tx, {
      id,
      numero: current.numero,
      status: nextStatus,
      total: calculated.total.toFixed(2),
      commissionVal: calculated.commissionVal.toFixed(2),
      orderDate,
      dueDate,
      sellerId,
      customerName: current.customer?.tradeName ?? 'cliente',
      sellerName: seller?.name ?? null,
    });

    return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  });

  return toOrderDTO(updated, { withAddress: true });
}

/** Recarrega o saldo atual dos produtos no contexto em memória. */
async function refreshStock(tx: Tx, products: PricingContext['products']): Promise<void> {
  const ids = [...products.keys()];
  if (ids.length === 0) return;

  const rows = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, stock: true },
  });

  for (const row of rows as Array<{ id: string; stock: unknown }>) {
    const product = products.get(row.id);
    if (product) product.stock = String(row.stock);
  }
}

export async function cancelOrder(session: SessionPayload, id: string): Promise<OrderDTO> {
  const cancelled = await prisma.$transaction(async (tx: Tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      include: {
        items: { select: { productId: true, quantity: true } },
        customer: { select: { tradeName: true } },
        seller: { select: { name: true } },
      },
    });
    if (!current) throw notFound('Pedido');

    if (!isManagement(session) && current.sellerId !== session.sellerId) {
      throw notFound('Pedido');
    }

    if (current.status === 'cancelado') {
      throw conflict('Este pedido já está cancelado.');
    }

    if (movesStock(current.status as OrderStatus)) {
      const context = await loadPricingContext(
        tx,
        current.items.map((i: { productId: string }) => i.productId),
        current.customerId,
      );
      await applyStock(
        tx,
        id,
        current.numero,
        current.items.map((i: { productId: string; quantity: unknown }) => ({
          productId: i.productId,
          quantity: String(i.quantity),
        })),
        context.products,
        'restore',
      );
    }

    await syncOrderFinancials(tx, {
      id,
      numero: current.numero,
      status: 'cancelado',
      total: String(current.total),
      commissionVal: String(current.commissionVal),
      orderDate: current.orderDate,
      dueDate: current.dueDate,
      sellerId: current.sellerId,
      customerName: current.customer?.tradeName ?? 'cliente',
      sellerName: current.seller?.name ?? null,
    });

    await tx.order.update({ where: { id }, data: { status: 'cancelado' } });

    return tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  });

  return toOrderDTO(cancelled, { withAddress: true });
}
