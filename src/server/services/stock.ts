/**
 * Estoque: movimentação manual (scanner de produção) e histórico.
 */
import { planManualMovement, type StockMovementType } from '../domain/stock';
import { qty } from '../domain/money';
import { prisma } from '../db';
import { conflict, notFound } from '../http/errors';
import { num, timestamp } from './serializers';

export interface StockLookupDTO {
  id: string;
  name: string;
  type: 'venda' | 'insumo';
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  trackStock: boolean;
}

export async function lookupByCode(code: string): Promise<StockLookupDTO> {
  const trimmed = code.trim();
  if (!trimmed) throw notFound('Código');

  const product = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ barCode: trimmed }, { sku: trimmed }, { internalCode: trimmed }],
    },
    select: {
      id: true,
      name: true,
      type: true,
      category: true,
      unit: true,
      stock: true,
      minStock: true,
      trackStock: true,
    },
  });

  if (!product) throw notFound('Código');

  return {
    id: product.id,
    name: product.name,
    type: product.type,
    category: product.category ?? '',
    unit: product.unit ?? 'un',
    stock: num(product.stock),
    minStock: num(product.minStock),
    trackStock: product.trackStock,
  };
}

export interface MovementResultDTO {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unit: string;
  createdAt: string | null;
}

/**
 * Registra um movimento avulso.
 *
 * Saída que deixaria o saldo negativo é recusada. O sistema anterior permitia
 * estoque negativo silenciosamente, o que mascarava erro de contagem.
 */
export async function registerMovement(input: {
  productId: string;
  type: StockMovementType;
  quantity: string;
  observation: string | null;
  allowNegative?: boolean;
}): Promise<MovementResultDTO> {
  return prisma.$transaction(async (tx: typeof prisma) => {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, stock: true, unit: true, trackStock: true, active: true },
    });
    if (!product) throw notFound('Produto');
    if (!product.active) throw conflict('Este produto está arquivado.');
    if (!product.trackStock) throw conflict('Este produto não movimenta estoque.');

    const movement = planManualMovement({
      product: {
        id: product.id,
        name: product.name,
        stock: String(product.stock),
        trackStock: product.trackStock,
      },
      type: input.type,
      quantity: input.quantity,
      observation: input.observation,
    });

    if (!input.allowNegative && movement.stockAfter.isNegative()) {
      throw conflict(
        `Saldo insuficiente: há ${qty(product.stock).toFixed(3)} ${product.unit} em estoque.`,
      );
    }

    const created = await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: movement.type,
        quantity: movement.quantity.toFixed(3),
        stockBefore: movement.stockBefore.toFixed(3),
        stockAfter: movement.stockAfter.toFixed(3),
        observation: movement.observation || null,
      },
    });

    await tx.product.update({
      where: { id: product.id },
      data: { stock: movement.stockAfter.toFixed(3) },
    });

    return {
      id: created.id,
      productId: product.id,
      productName: product.name,
      type: movement.type,
      quantity: num(movement.quantity),
      stockBefore: num(movement.stockBefore),
      stockAfter: num(movement.stockAfter),
      unit: product.unit ?? 'un',
      createdAt: timestamp(created.createdAt),
    };
  });
}

export interface MovementHistoryDTO {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  unit: string;
  orderId: string | null;
  orderNumber: number | null;
  observation: string | null;
  createdAt: string | null;
}

export async function listMovements(params: {
  productId?: string | null;
  limit: number;
  range: 'today' | 'all';
}): Promise<MovementHistoryDTO[]> {
  const where: Record<string, unknown> = {};
  if (params.productId) where.productId = params.productId;

  if (params.range === 'today') {
    // Janela em UTC, coerente com o carimbo gravado — o sistema anterior
    // comparava data local com carimbo UTC e perdia movimentos.
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    where.createdAt = { gte: start };
  }

  const rows = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { name: true, unit: true } },
      order: { select: { numero: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  });

  return rows.map(
    (row: {
      id: string;
      productId: string;
      type: string;
      quantity: unknown;
      stockBefore: unknown;
      stockAfter: unknown;
      orderId: string | null;
      observation: string | null;
      createdAt: Date;
      product?: { name: string; unit: string } | null;
      order?: { numero: number } | null;
    }) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product?.name ?? '—',
      type: row.type,
      quantity: num(row.quantity),
      stockBefore: num(row.stockBefore),
      stockAfter: num(row.stockAfter),
      unit: row.product?.unit ?? 'un',
      orderId: row.orderId,
      orderNumber: row.order?.numero ?? null,
      observation: row.observation,
      createdAt: timestamp(row.createdAt),
    }),
  );
}
