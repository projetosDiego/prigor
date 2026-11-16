import { z } from 'zod';

import { isValidCnpj, isValidCpf } from '../documents';
import { onlyDigits } from '../text';

const text = (max: number) => z.string().trim().max(max);

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ sku: text(80), option: text(80).optional().default(''), quantity: z.coerce.number().int().min(1).max(500) }))
      .min(1, 'Seu carrinho está vazio.')
      .max(60),
    customer: z.object({
      type: z.enum(['PF', 'PJ']),
      document: text(20),
      name: text(120).min(5, 'Informe o nome completo.'),
      companyName: text(160).optional().default(''),
      phone: text(20),
      email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.').max(160)]).optional().default(''),
    }),
    fulfillment: z.enum(['ENTREGA', 'RETIRADA']),
    pickupPoint: text(80).optional().default(''),
    address: z
      .object({
        zipCode: text(10).optional().default(''),
        street: text(160).optional().default(''),
        number: text(20).optional().default(''),
        complement: text(80).optional().default(''),
        neighborhood: text(80).optional().default(''),
        city: text(80).optional().default(''),
        state: text(2).optional().default(''),
      })
      .optional()
      .default({ zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }),
    deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha a data.'),
    paymentPlan: z.enum(['SINAL_50', 'TOTAL']),
    paymentMethod: z.enum(['PIX', 'CARTAO']),
    notes: text(600).optional().default(''),
    consent: z.literal(true, { message: 'É preciso aceitar a política de privacidade.' }),
    website: z.string().optional().default(''), // honeypot
    utmSource: text(80).optional().default(''),
  })
  .superRefine((v, ctx) => {
    const doc = onlyDigits(v.customer.document);
    if (v.customer.type === 'PF' && !isValidCpf(doc)) ctx.addIssue({ code: 'custom', path: ['customer', 'document'], message: 'CPF inválido.' });
    if (v.customer.type === 'PJ' && !isValidCnpj(doc)) ctx.addIssue({ code: 'custom', path: ['customer', 'document'], message: 'CNPJ inválido.' });
    if (v.customer.type === 'PJ' && v.customer.companyName.length < 2)
      ctx.addIssue({ code: 'custom', path: ['customer', 'companyName'], message: 'Informe a razão social ou o nome da empresa.' });
    const phone = onlyDigits(v.customer.phone);
    if (phone.length < 10 || phone.length > 11) ctx.addIssue({ code: 'custom', path: ['customer', 'phone'], message: 'Telefone inválido: inclua o DDD.' });
    if (v.fulfillment === 'ENTREGA') {
      const a = v.address;
      if (onlyDigits(a.zipCode).length !== 8) ctx.addIssue({ code: 'custom', path: ['address', 'zipCode'], message: 'CEP inválido.' });
      if (a.street.length < 3) ctx.addIssue({ code: 'custom', path: ['address', 'street'], message: 'Informe a rua.' });
      if (!a.number) ctx.addIssue({ code: 'custom', path: ['address', 'number'], message: 'Informe o número (ou “s/n”).' });
      if (a.neighborhood.length < 2) ctx.addIssue({ code: 'custom', path: ['address', 'neighborhood'], message: 'Informe o bairro.' });
      if (a.city.length < 2) ctx.addIssue({ code: 'custom', path: ['address', 'city'], message: 'Informe a cidade.' });
      if (!/^[A-Za-z]{2}$/.test(a.state)) ctx.addIssue({ code: 'custom', path: ['address', 'state'], message: 'UF inválida.' });
    } else if (!v.pickupPoint) {
      ctx.addIssue({ code: 'custom', path: ['pickupPoint'], message: 'Escolha onde vai retirar.' });
    }
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;
