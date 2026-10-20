import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { createExpense } from '@/server/services/finance';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  value: z.number().positive().max(1e9),
  dueDate: iso,
  installments: z.number().int().min(1).max(60).default(1),
  paid: z.boolean().default(false),
  paymentDate: iso.nullish(),
  accountId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

/** Lança uma despesa (à vista, já paga ou parcelada). */
export const POST = route('financeiro.despesa.criar', async (request) => {
  await requireManager();
  return ok(await createExpense(schema.parse(await readJson(request))));
});
