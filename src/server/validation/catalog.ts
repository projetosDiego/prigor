/**
 * Schemas de produto, insumo e ficha técnica.
 */
import { z } from 'zod';

import {
  booleanFlag,
  money,
  optionalText,
  optionalUuid,
  percent,
  quantity,
  requiredText,
  uuid,
} from './common';

export const productTypeSchema = z.enum(['venda', 'insumo']);

export const recipeLineSchema = z.object({
  ingredientId: uuid('Insumo'),
  quantity: quantity('Quantidade do insumo', { min: 0.001 }),
  observation: optionalText(255),
});

/**
 * Corpo de criação/atualização de produto.
 *
 * `custo` não é aceito para produto com ficha técnica: nesse caso ele é
 * sempre derivado da receita. Isso evita o bug antigo em que a tela deixava de
 * enviar `custo` e o backend gravava zero em cima do valor real.
 */
export const productInputSchema = z
  .object({
    sku: optionalText(40),
    barCode: optionalText(40),
    internalCode: optionalText(40),
    name: requiredText('Nome', 200),
    storeName: optionalText(200),
    description: optionalText(2000),
    storeDescription: optionalText(2000),
    category: optionalText(120),
    subcategory: optionalText(120),
    brand: optionalText(120),
    model: optionalText(120),
    type: productTypeSchema.default('venda'),
    unit: z.string().trim().min(1).max(20).default('un'),

    salePrice: money('Preço de venda').default('0.00'),
    wholesalePrice: money('Preço de atacado').default('0.00'),
    minWholesaleQty: quantity('Quantidade mínima de atacado').default('0.000'),
    priceFrom: money('Preço "de"').default('0.00'),
    priceTo: money('Preço "por"').default('0.00'),
    cost: money('Custo').optional(),

    stock: quantity('Estoque', { min: -9_999_999 }).default('0.000'),
    minStock: quantity('Estoque mínimo').default('0.000'),
    trackStock: z.boolean().default(true),

    ncm: optionalText(20),
    cfop: optionalText(10),
    origin: optionalText(5),
    cest: optionalText(20),

    weightKg: quantity('Peso').default('0.000'),
    heightCm: quantity('Altura').default('0.000'),
    widthCm: quantity('Largura').default('0.000'),
    depthCm: quantity('Profundidade').default('0.000'),

    tags: optionalText(255),
    warranty: optionalText(255),
    includedItems: optionalText(2000),
    specifications: optionalText(2000),
    image: optionalText(255),

    commissionPct: z.union([percent('Comissão'), z.null()]).optional(),
    active: z.boolean().default(true),

    recipe: z.array(recipeLineSchema).max(100, 'Ficha técnica com itens demais.').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.recipe && value.recipe.length > 0) {
      const ids = value.recipe.map((line) => line.ingredientId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['recipe'],
          message: 'A ficha técnica tem o mesmo insumo repetido.',
        });
      }
    }
    if (Number(value.priceTo) > 0 && Number(value.priceFrom) > 0 && Number(value.priceTo) > Number(value.priceFrom)) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceTo'],
        message: 'O preço promocional não pode ser maior que o preço original.',
      });
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const productListQuerySchema = z.object({
  type: productTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  activeOnly: booleanFlag(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

export const stockAdjustmentSchema = z.object({
  productId: uuid('Produto'),
  type: z.enum(['baixa_insumo', 'entrada_recheio', 'entrada_produto', 'saida_venda']),
  quantity: quantity('Quantidade', { min: 0.001 }),
  observation: optionalText(255),
});

export const stockHistoryQuerySchema = z.object({
  productId: optionalUuid('Produto'),
  limit: z.coerce.number().int().min(1).max(200).default(30),
  /** `today` mantém o comportamento da tela de produção. */
  range: z.enum(['today', 'all']).default('today'),
});
