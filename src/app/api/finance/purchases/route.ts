import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { createPurchase, listPurchases } from '@/server/services/finance';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  supplierId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
  date: iso,
  document: z.string().trim().max(60).nullish(),
  category: z.string().trim().min(1).max(80),
  items: z
    .array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().positive().max(1e7), unit: z.string().trim().max(20).nullish(), unitPrice: z.number().min(0).max(1e8) }))
    .min(1)
    .max(100),
  installments: z.number().int().min(1).max(60).default(1),
  firstDue: iso,
  paid: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullish(),
});

export const GET = route('financeiro.compras.listar', async () => {
  await requireManager();
  return ok(await listPurchases());
});

export const POST = route('financeiro.compras.criar', async (request) => {
  await requireManager();
  return ok(await createPurchase(schema.parse(await readJson(request))));
});
