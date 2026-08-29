/**
 * Produtos, insumos e ficha técnica.
 */
import type { Prisma } from '@prisma/client';

import { calculateRecipeCost } from '../domain/stock';
import { dec, money } from '../domain/money';
import { prisma, prismaErrorCode, uniqueViolationFields, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import type { ProductInput } from '../validation/catalog';
import { paginated, toProductDTO, type Paginated, type ProductDTO } from './serializers';
import type { Tx } from '../tx';

const RECIPE_INCLUDE = {
  ingredients: {
    include: { ingredient: { select: { name: true, unit: true, cost: true } } },
    orderBy: { id: 'asc' as const },
  },
};

export interface ListProductsParams {
  type?: 'venda' | 'insumo';
  search?: string;
  activeOnly: boolean;
  page: number;
  pageSize: number;
}

export async function listProducts(params: ListProductsParams): Promise<Paginated<ProductDTO>> {
  const where: Record<string, unknown> = {};
  if (params.type) where.type = params.type;
  if (params.activeOnly) where.active = true;

  if (params.search) {
    const search = params.search;
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
      { barCode: { contains: search, mode: 'insensitive' } },
      { internalCode: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: RECIPE_INCLUDE,
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return paginated(rows.map(toProductDTO), total, params.page, params.pageSize);
}

export async function getProduct(id: string): Promise<ProductDTO> {
  const row = await prisma.product.findUnique({ where: { id }, include: RECIPE_INCLUDE });
  if (!row) throw notFound('Produto');
  return toProductDTO(row);
}

/**
 * Custo de um produto com ficha técnica.
 * Produto sem ficha mantém o custo informado manualmente.
 */
async function resolveCost(
  input: ProductInput,
  currentCost: string | null,
  tx: Tx,
): Promise<string> {
  const recipe = input.recipe ?? [];

  if (recipe.length === 0) {
    // Sem receita: usa o custo enviado; se não veio nenhum, preserva o atual.
    return input.cost ?? currentCost ?? '0.00';
  }

  const ingredientIds = recipe.map((line) => line.ingredientId);
  const ingredients = await tx.product.findMany({
    where: { id: { in: ingredientIds } },
    select: { id: true, cost: true, type: true },
  });

  if (ingredients.length !== new Set(ingredientIds).size) {
    throw badRequest('A ficha técnica referencia um insumo que não existe.');
  }

  const costs = new Map<string, string>(
    ingredients.map((i: { id: string; cost: unknown }) => [i.id, String(i.cost)]),
  );

  return money(calculateRecipeCost(recipe, costs)).toFixed(2);
}

function toPersistable(input: ProductInput, cost: string): Prisma.ProductUncheckedCreateInput {
  return {
    sku: input.sku,
    barCode: input.barCode,
    internalCode: input.internalCode,
    name: input.name,
    storeName: input.storeName,
    description: input.description,
    storeDescription: input.storeDescription,
    category: input.category,
    subcategory: input.subcategory,
    brand: input.brand,
    model: input.model,
    type: input.type,
    unit: input.unit,
    salePrice: input.salePrice,
    wholesalePrice: input.wholesalePrice,
    minWholesaleQty: input.minWholesaleQty,
    priceFrom: input.priceFrom,
    priceTo: input.priceTo,
    cost,
    stock: input.stock,
    minStock: input.minStock,
    trackStock: input.trackStock,
    ncm: input.ncm,
    cfop: input.cfop,
    origin: input.origin,
    cest: input.cest,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    widthCm: input.widthCm,
    depthCm: input.depthCm,
    tags: input.tags,
    warranty: input.warranty,
    includedItems: input.includedItems,
    specifications: input.specifications,
    image: input.image,
    commissionPct: input.commissionPct ?? null,
    active: input.active,
  };
}

function handleUniqueError(error: unknown): never {
  if (prismaErrorCode(error) === UNIQUE_VIOLATION) {
    const fields = uniqueViolationFields(error);
    const label = fields.includes('sku') ? 'SKU' : fields.join(', ') || 'campo único';
    throw conflict(`Já existe um produto com esse ${label}.`);
  }
  throw error;
}

export async function createProduct(input: ProductInput): Promise<ProductDTO> {
  try {
    const created = await prisma.$transaction(async (tx: Tx) => {
      const cost = await resolveCost(input, null, tx);

      const product = await tx.product.create({ data: toPersistable(input, cost) });

      if (input.recipe?.length) {
        await tx.recipeIngredient.createMany({
          data: input.recipe.map((line) => ({
            productFinalId: product.id,
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            observation: line.observation,
          })),
        });
      }

      return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: RECIPE_INCLUDE });
    });

    return toProductDTO(created);
  } catch (error) {
    handleUniqueError(error);
  }
}

/**
 * Atualização.
 *
 * `recipe` ausente preserva a ficha técnica existente — no sistema anterior a
 * ausência do campo apagava a receita inteira, o que zerava o custo do produto
 * sem ninguém perceber. Para remover a ficha é preciso enviar `recipe: []`.
 */
export async function updateProduct(id: string, input: ProductInput): Promise<ProductDTO> {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { ingredients: { select: { ingredientId: true, quantity: true, observation: true } } },
  });
  if (!existing) throw notFound('Produto');

  const recipeProvided = input.recipe !== undefined;
  const effectiveRecipe = recipeProvided
    ? input.recipe!
    : existing.ingredients.map((line: { ingredientId: string; quantity: unknown; observation: string | null }) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
        observation: line.observation,
      }));

  if (effectiveRecipe.some((line: { ingredientId: string }) => line.ingredientId === id)) {
    throw badRequest('Um produto não pode ser insumo de si mesmo.');
  }

  try {
    const updated = await prisma.$transaction(async (tx: Tx) => {
      const cost = await resolveCost(
        { ...input, recipe: effectiveRecipe },
        String(existing.cost),
        tx,
      );

      await tx.product.update({ where: { id }, data: toPersistable(input, cost) });

      if (recipeProvided) {
        await tx.recipeIngredient.deleteMany({ where: { productFinalId: id } });
        if (input.recipe!.length > 0) {
          await tx.recipeIngredient.createMany({
            data: input.recipe!.map((line) => ({
              productFinalId: id,
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              observation: line.observation,
            })),
          });
        }
      }

      return tx.product.findUniqueOrThrow({ where: { id }, include: RECIPE_INCLUDE });
    });

    return toProductDTO(updated);
  } catch (error) {
    handleUniqueError(error);
  }
}

/** Arquiva o produto (soft delete). */
export async function archiveProduct(id: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Produto');

  const usedIn = await prisma.recipeIngredient.count({ where: { ingredientId: id } });
  if (usedIn > 0) {
    throw conflict(
      `Este insumo está em ${usedIn} ficha(s) técnica(s). Remova-o das receitas antes de arquivar.`,
    );
  }

  await prisma.product.update({ where: { id }, data: { active: false } });
}

export async function restoreProduct(id: string): Promise<ProductDTO> {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Produto');
  await prisma.product.update({ where: { id }, data: { active: true } });
  return getProduct(id);
}

/** Busca por código de barras, SKU ou código interno — usado pelo scanner. */
export async function findByCode(code: string): Promise<ProductDTO> {
  const row = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ barCode: code }, { sku: code }, { internalCode: code }],
    },
    include: RECIPE_INCLUDE,
  });
  if (!row) throw notFound('Código');
  return toProductDTO(row);
}

/**
 * Recalcula o custo de todos os produtos que usam um insumo.
 * Chamado quando o custo do insumo muda, para que a margem não fique defasada.
 */
export async function recalculateDependentCosts(ingredientId: string): Promise<number> {
  const dependents = await prisma.recipeIngredient.findMany({
    where: { ingredientId },
    select: { productFinalId: true },
    distinct: ['productFinalId'],
  });

  let updated = 0;
  for (const { productFinalId } of dependents as Array<{ productFinalId: string }>) {
    const recipe = await prisma.recipeIngredient.findMany({
      where: { productFinalId },
      include: { ingredient: { select: { id: true, cost: true } } },
    });

    const costs = new Map<string, string>(
      recipe.map((line: { ingredient: { id: string; cost: unknown } }) => [
        line.ingredient.id,
        String(line.ingredient.cost),
      ]),
    );

    const cost = calculateRecipeCost(
      recipe.map((line: { ingredientId: string; quantity: unknown }) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
      })),
      costs,
    );

    await prisma.product.update({
      where: { id: productFinalId },
      data: { cost: money(cost).toFixed(2) },
    });
    updated += 1;
  }

  return updated;
}

/** Produtos com estoque igual ou abaixo do mínimo configurado. */
export async function lowStockProducts(limit = 20): Promise<ProductDTO[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM produtos
    WHERE ativo = true AND estoque_minimo > 0 AND estoque <= estoque_minimo
    ORDER BY (estoque - estoque_minimo) ASC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r: { id: string }) => r.id) } },
    include: RECIPE_INCLUDE,
  });

  return products.map(toProductDTO);
}

export function costFromRecipe(
  recipe: Array<{ ingredientId: string; quantity: string }>,
  costs: Map<string, string>,
): string {
  return money(calculateRecipeCost(recipe, costs)).toFixed(2);
}

export { dec };
