import { z } from 'zod';

import { normalizeMobile } from '../domain/loyalty';
import { optionalText, requiredText, uuid } from './common';

const pointCode = z.string().trim().toLowerCase().max(20);

const mobile = z
  .string()
  .trim()
  .max(30)
  .transform((v, ctx) => {
    const n = normalizeMobile(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Informe um celular com DDD, ex.: (21) 98765-4321.' });
      return z.NEVER;
    }
    return n;
  });

const pin = z.string().trim().regex(/^\d{4}$/, 'O PIN deve ter 4 números.');

export const loyaltySignupSchema = z.object({
  name: requiredText('Nome', 80).refine((v) => v.trim().length >= 2, 'Informe seu nome.'),
  phone: mobile,
  neighborhood: optionalText(80),
  marketingConsent: z.boolean().default(false),
  pin,
  pointCode: pointCode.optional().nullable(),
  referralCode: z.string().trim().toLowerCase().max(20).optional().nullable(),
  smsCode: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 números.').optional().nullable(),
});

export const loyaltyCodeRequestSchema = z.object({ phone: mobile, purpose: z.enum(['cadastro', 'pin']) });
export const loyaltyPinResetSchema = z.object({
  phone: mobile,
  code: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 números.'),
  pin,
});

export const loyaltyLoginSchema = z.object({ phone: mobile, pin });
export const loyaltyPinSchema = z.object({ pin });

export const loyaltyRedeemSchema = z.object({
  rewardId: uuid('Cupom'),
  pointCode,
});

export const loyaltyProofSchema = z.object({
  imageBase64: z.string().min(10).max(2_200_000),
  mime: z.string().max(30),
  note: optionalText(200),
});

export const loyaltyExchangeSchema = z.object({ prizeId: uuid('Prêmio') });

// ─── Gestão ─────────────────────────────────────────────────────────────────

export const loyaltySettleSchema = z.object({
  orderNumber: z.coerce.number().int().positive().nullable().optional(),
});

export const loyaltyConfirmSchema = z.object({ confirmed: z.boolean() });

const optionalInt = (min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `Use um número inteiro entre ${min} e ${max}.` });
        return z.NEVER;
      }
      return n;
    });

export const loyaltyPrizeSchema = z.object({
  code: z.string().trim().max(40).optional(),
  title: requiredText('Nome do prêmio', 80),
  description: optionalText(200),
  bonusUnits: z.coerce.number().min(0).max(100).transform((v) => v.toFixed(3)),
  drawWeight: z.coerce.number().int().min(0).max(100_000),
  pointsCost: optionalInt(1, 1_000_000),
  stockPerPoint: optionalInt(0, 100_000),
  requiresCheck: z.boolean(),
  validDays: optionalInt(1, 365),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const loyaltyTaskSchema = z.object({
  title: requiredText('Título', 80),
  description: optionalText(300),
  points: z.coerce.number().int().min(0).max(100_000),
  actionUrl: optionalText(300).refine((v) => v === null || /^https?:\/\//.test(v), 'O link deve começar com http:// ou https://'),
  actionLabel: optionalText(40),
  cooldownDays: optionalInt(1, 365),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export const loyaltyReviewSchema = z.object({ approve: z.boolean(), note: optionalText(200) });
export const loyaltyStockSchema = z.object({ prizeId: uuid('Prêmio'), quantity: z.coerce.number().int().min(0).max(100_000) });
export const loyaltyPointsAdjustSchema = z.object({
  delta: z.coerce.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, 'Informe os pontos.'),
  description: requiredText('Motivo', 120),
});
export const loyaltyGrantSchema = z.object({ prizeId: uuid('Prêmio'), note: optionalText(200) });
export const loyaltyReissueSchema = z.object({ reason: requiredText('Motivo', 200) });

export const loyaltySmsSettingsSchema = z.object({
  smsRequired: z.boolean(),
  /** Ausente = mantém a chave atual; vazio = apaga. */
  smsApiKey: z.string().trim().max(200).nullable().optional(),
  smsDailyLimit: z.coerce.number().int().min(1).max(100_000),
});
export const loyaltySmsTestSchema = z.object({ phone: mobile });
