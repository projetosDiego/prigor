/**
 * Schemas de pedido, cliente, vendedor e financeiro.
 */
import { z } from 'zod';

import {
  booleanFlag,
  digits,
  email,
  isoDate,
  money,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  percent,
  quantity,
  requiredText,
  uuid,
} from './common';

export const orderStatusSchema = z.enum([
  'novo',
  'confirmado',
  'em_producao',
  'entregue',
  'faturado',
  'cancelado',
]);

export const paymentMethodSchema = z.enum([
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'boleto',
  'transferencia',
]);

export const orderItemSchema = z.object({
  productId: uuid('Produto'),
  quantity: quantity('Quantidade', { min: 0.001 }),
  /** Ausente ou nulo → servidor resolve pela tabela de preços. */
  unitPrice: z.union([money('Preço unitário'), z.null()]).optional(),
  discountItem: money('Desconto do item').default('0.00'),
});

export const orderCreateSchema = z.object({
  customerId: uuid('Cliente'),
  sellerId: optionalUuid('Vendedor'),
  status: orderStatusSchema.default('novo'),
  paymentMethod: paymentMethodSchema.default('pix'),
  orderDate: isoDate('Data do pedido'),
  deliveryDate: optionalIsoDate('Data de entrega'),
  billingDate: optionalIsoDate('Data de faturamento'),
  dueDate: optionalIsoDate('Data de vencimento'),
  discount: money('Desconto').default('0.00'),
  shipping: money('Frete').default('0.00'),
  otherCosts: money('Outros custos').default('0.00'),
  notes: optionalText(2000),
  items: z
    .array(orderItemSchema)
    .min(1, 'O pedido precisa ter pelo menos um item.')
    .max(200, 'Pedido com itens demais.'),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** Atualização parcial: só o que vier é alterado. */
export const orderUpdateSchema = z
  .object({
    customerId: uuid('Cliente').optional(),
    sellerId: optionalUuid('Vendedor').optional(),
    status: orderStatusSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    orderDate: isoDate('Data do pedido').optional(),
    deliveryDate: optionalIsoDate('Data de entrega').optional(),
    billingDate: optionalIsoDate('Data de faturamento').optional(),
    dueDate: optionalIsoDate('Data de vencimento').optional(),
    discount: money('Desconto').optional(),
    shipping: money('Frete').optional(),
    otherCosts: money('Outros custos').optional(),
    notes: optionalText(2000).optional(),
    items: z
      .array(orderItemSchema)
      .min(1, 'O pedido precisa ter pelo menos um item.')
      .max(200, 'Pedido com itens demais.')
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

/** Aceita um status ou vários separados por vírgula (`?status=confirmado,faturado`). */
const orderStatusListSchema = z
  .string()
  .transform((v, ctx) => {
    const parts = v
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const parsed = parts.map((p) => orderStatusSchema.safeParse(p));
    const invalid = parsed.find((r) => !r.success);
    if (invalid || parts.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Status de pedido inválido.' });
      return z.NEVER;
    }
    return parts as Array<z.infer<typeof orderStatusSchema>>;
  })
  .optional();

export const orderListQuerySchema = z.object({
  status: orderStatusListSchema,
  customerId: optionalUuid('Cliente'),
  sellerId: optionalUuid('Vendedor'),
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
  deliveryFrom: optionalIsoDate('Entrega inicial'),
  deliveryTo: optionalIsoDate('Entrega final'),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Cliente ────────────────────────────────────────────────────────────────

export const customerInputSchema = z.object({
  tradeName: requiredText('Nome', 200),
  legalName: optionalText(200),
  cnpj: digits('CNPJ', { length: [14] }),
  cpf: digits('CPF', { length: [11] }),
  phone: optionalText(40),
  mobile: optionalText(40),
  email: email(),
  address: optionalText(255),
  number: optionalText(20),
  complement: optionalText(120),
  neighborhood: optionalText(120),
  city: optionalText(120),
  state: optionalText(2),
  zipCode: digits('CEP', { length: [8] }),
  latitude: z.union([z.coerce.number().min(-90).max(90), z.null()]).optional(),
  longitude: z.union([z.coerce.number().min(-180).max(180), z.null()]).optional(),
  category: optionalText(120),
  regionId: optionalUuid('Região'),
  neighborhoodId: optionalUuid('Bairro'),
  notes: optionalText(2000),
  isReseller: z.boolean().default(false),
  active: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customerUpdateSchema = customerInputSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'Nada para atualizar.',
);

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  activeOnly: booleanFlag(true),
  sellerId: optionalUuid('Vendedor'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

// ─── Vendedor ───────────────────────────────────────────────────────────────

export const sellerInputSchema = z.object({
  name: requiredText('Nome', 120),
  phone: optionalText(40),
  email: email(),
  commissionPct: percent('Comissão').default('0.00'),
  goal: z.coerce.number().int().min(0).default(0),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});

export const sellerUpdateSchema = sellerInputSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'Nada para atualizar.',
);

// ─── Financeiro ─────────────────────────────────────────────────────────────

export const transactionTypeSchema = z.enum(['receita', 'despesa']);
export const transactionStatusSchema = z.enum(['pendente', 'pago', 'atrasado', 'cancelado']);

export const transactionInputSchema = z
  .object({
    type: transactionTypeSchema,
    description: requiredText('Descrição', 255),
    category: optionalText(80),
    value: money('Valor', { min: 0.01 }),
    issueDate: isoDate('Data de lançamento'),
    dueDate: optionalIsoDate('Data de vencimento'),
    paymentDate: optionalIsoDate('Data de pagamento'),
    status: transactionStatusSchema.default('pendente'),
    orderId: optionalUuid('Pedido'),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'pago' && !value.paymentDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentDate'],
        message: 'Lançamento pago precisa de data de pagamento.',
      });
    }
    if (value.dueDate && value.dueDate < value.issueDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'O vencimento não pode ser anterior ao lançamento.',
      });
    }
  });

export const transactionUpdateSchema = z
  .object({
    description: requiredText('Descrição', 255).optional(),
    category: optionalText(80).optional(),
    value: money('Valor', { min: 0.01 }).optional(),
    dueDate: optionalIsoDate('Data de vencimento').optional(),
    status: transactionStatusSchema.optional(),
    notes: optionalText(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const transactionListQuerySchema = z.object({
  type: transactionTypeSchema.optional(),
  status: transactionStatusSchema.optional(),
  category: z.string().trim().max(80).optional(),
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
  orderId: optionalUuid('Pedido'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

export const settleTransactionSchema = z.object({
  paymentDate: optionalIsoDate('Data de pagamento'),
});
