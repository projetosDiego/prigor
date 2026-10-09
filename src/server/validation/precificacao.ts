/**
 * Schemas do módulo Precificação.
 * Aceitam número ou texto com vírgula ("12,5") e devolvem `number`.
 */
import { z } from 'zod';

import { optionalText, requiredText } from './common';

const numeric = (label: string, opts: { min?: number; max?: number } = {}) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const parsed = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} deve ser um número.` });
        return z.NEVER;
      }
      const min = opts.min ?? 0;
      const max = opts.max ?? 999_999_999;
      if (parsed < min || parsed > max) {
        ctx.addIssue({ code: 'custom', message: `${label} deve estar entre ${min} e ${max}.` });
        return z.NEVER;
      }
      return parsed;
    });

export const pricingSettingsSchema = z.object({
  energyKwhPrice: numeric('Preço do kWh'),
  gasCylinderPrice: numeric('Preço do botijão'),
  gasCylinderKg: numeric('Kg do botijão', { min: 0.1 }),
  workDaysPerMonth: numeric('Dias de trabalho no mês', { min: 1, max: 31 }),
  hoursPerDay: numeric('Horas por dia', { min: 0.5, max: 24 }),
  ifoodFeePct: numeric('Taxa iFood', { max: 99 }),
  cardFeePct: numeric('Taxa de cartão', { max: 99 }),
  taxPct: numeric('Imposto', { max: 99 }),
  resellerCommissionPct: numeric('Comissão da revenda', { max: 99 }).default(0),
  targetMarginPct: numeric('Margem alvo', { max: 95 }),
  revenueMonths: numeric('Meses da média', { min: 1, max: 12 }),
  revenueOverride: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Receita manual inválida.' });
        return z.NEVER;
      }
      return parsed === 0 ? null : parsed;
    }),
});
export type PricingSettingsInputDTO = z.infer<typeof pricingSettingsSchema>;

export const pricingFixedCostSchema = z.object({
  name: requiredText('Nome'),
  monthlyAmount: numeric('Valor mensal'),
  active: z.boolean().default(true),
});
export type PricingFixedCostInput = z.infer<typeof pricingFixedCostSchema>;

export const pricingResourceSchema = z.object({
  name: requiredText('Nome'),
  kind: z.enum(['eletrico', 'gas', 'mao_de_obra']),
  watts: numeric('Potência (W)').default(0),
  gasKgPerHour: numeric('Consumo de gás (kg/h)').default(0),
  monthlySalary: numeric('Salário mensal').default(0),
  chargesPct: numeric('Encargos', { max: 500 }).default(0),
  active: z.boolean().default(true),
});
export type PricingResourceInput = z.infer<typeof pricingResourceSchema>;

export const pricingIngredientSchema = z.object({
  name: requiredText('Nome'),
  category: z.enum(['materia_prima', 'embalagem', 'base_recheio', 'outros']).default('materia_prima'),
  unit: requiredText('Unidade', 30).default('gramas'),
  purchaseQty: numeric('Quantidade comprada', { min: 0.0001 }),
  purchasePrice: numeric('Preço de compra'),
  lossPct: numeric('Perda', { max: 99 }).default(0),
  priceUpdatedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
    .nullish(),
  active: z.boolean().default(true),
});
export type PricingIngredientInput = z.infer<typeof pricingIngredientSchema>;

export const pricingLineSchema = z
  .object({
    ingredientId: z.string().uuid().nullish(),
    resourceId: z.string().uuid().nullish(),
    subSheetId: z.string().uuid().nullish(),
    quantity: numeric('Quantidade'),
  })
  .refine(
    (l) => [l.ingredientId, l.resourceId, l.subSheetId].filter(Boolean).length === 1,
    'Cada linha precisa de exatamente um item (insumo, recurso ou ficha).',
  );

export const pricingSheetSchema = z.object({
  kind: z.enum(['produto', 'massa', 'recheio']),
  name: requiredText('Nome'),
  yieldQty: numeric('Rendimento', { min: 0.0001 }),
  yieldUnit: requiredText('Unidade do rendimento', 30).default('unidades'),
  lossPct: numeric('Perda', { max: 99 }).default(0),
  markupPct: numeric('Markup', { max: 10000 }).default(100),
  totalWeightG: numeric('Peso total (g)').default(0),
  actualPrice: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Preço praticado inválido.' });
        return z.NEVER;
      }
      return parsed === 0 ? null : parsed;
    }),
  notes: optionalText(2000),
  productId: z.string().uuid().nullish(),
  active: z.boolean().default(true),
  lines: z.array(pricingLineSchema).max(60, 'No máximo 60 linhas por ficha.').default([]),
});
export type PricingSheetInput = z.infer<typeof pricingSheetSchema>;

/** Arquivo gerado a partir da planilha PreçoFácil (nomes no lugar de ids). */
export const pricingImportSchema = z.object({
  settings: pricingSettingsSchema.partial().optional(),
  fixedCosts: z.array(z.object({ name: z.string().min(1), monthlyAmount: numeric('Valor') })).default([]),
  resources: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(['eletrico', 'gas', 'mao_de_obra']),
        watts: numeric('W').optional(),
        gasKgPerHour: numeric('kg/h').optional(),
        monthlySalary: numeric('Salário').optional(),
        chargesPct: numeric('Encargos', { max: 500 }).optional(),
      }),
    )
    .default([]),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        category: z.enum(['materia_prima', 'embalagem', 'base_recheio', 'outros']).default('materia_prima'),
        unit: z.string().default('gramas'),
        purchaseQty: numeric('Quantidade', { min: 0.0001 }),
        purchasePrice: numeric('Preço'),
        lossPct: numeric('Perda', { max: 99 }).default(0),
        priceUpdatedAt: z.string().nullish(),
      }),
    )
    .default([]),
  sheets: z
    .array(
      z.object({
        kind: z.enum(['produto', 'massa', 'recheio']),
        name: z.string().min(1),
        yieldQty: numeric('Rendimento', { min: 0.0001 }),
        yieldUnit: z.string().default('unidades'),
        lossPct: numeric('Perda', { max: 99 }).default(0),
        markupPct: numeric('Markup', { max: 10000 }).nullish(),
        totalWeightG: numeric('Peso').nullish(),
        actualPrice: numeric('Preço praticado').nullish(),
        lines: z
          .array(
            z.object({
              ingredient: z.string().optional(),
              resource: z.string().optional(),
              subSheet: z.string().optional(),
              quantity: numeric('Quantidade'),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type PricingImportInput = z.infer<typeof pricingImportSchema>;
