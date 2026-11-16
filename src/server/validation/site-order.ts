import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const moneyStr = z.string().regex(/^\d{1,9}\.\d{2}$/, 'Valor inválido.');

/** Corpo enviado pelo site oficial (src/lib/orders/erp.ts no repositório do site). */
export const siteOrderSchema = z.object({
  source: z.literal('site'),
  campaign: text(40),
  code: z.string().regex(/^[A-Z]{2,5}-\d{4,}$/, 'Código do pedido inválido.'),
  createdAt: z.string(),
  customer: z.object({
    type: z.enum(['PF', 'PJ']),
    document: z.string().regex(/^(\d{11}|\d{14})$/, 'Documento inválido.'),
    name: text(160).min(2),
    companyName: text(160).default(''),
    phone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido.'),
    email: text(160).default(''),
  }),
  fulfillment: z.object({
    type: z.enum(['ENTREGA', 'RETIRADA']),
    pickupPoint: text(80).default(''),
    address: z
      .object({
        zipCode: text(10),
        street: text(160),
        number: text(20),
        complement: text(80).default(''),
        neighborhood: text(80),
        city: text(80),
        state: text(2),
      })
      .nullable(),
  }),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment: z.object({ plan: z.enum(['SINAL_50', 'TOTAL']), method: z.enum(['PIX', 'CARTAO']), amountDue: moneyStr }),
  items: z
    .array(
      z.object({
        sku: z.string().regex(/^[A-Z0-9-]{3,60}$/, 'SKU inválido.'),
        name: text(160).min(2),
        option: text(80).default(''),
        quantity: z.number().int().min(1).max(500),
        unitPrice: moneyStr,
        discountPct: z.number().min(0).max(90),
      }),
    )
    .min(1)
    .max(60),
  totals: z.object({ subtotal: moneyStr, discount: moneyStr, total: moneyStr }),
  notes: text(600).default(''),
});

export type SiteOrderPayload = z.infer<typeof siteOrderSchema>;
