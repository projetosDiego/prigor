import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { listRecurring, saveRecurring } from '@/server/services/finance';

const schema = z.object({
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  value: z.number().positive().max(1e9),
  dayOfMonth: z.number().int().min(1).max(31),
  supplierId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
});

export const GET = route('financeiro.recorrentes.listar', async () => {
  await requireManager();
  return ok(await listRecurring());
});

export const POST = route('financeiro.recorrentes.criar', async (request) => {
  await requireManager();
  const r = await saveRecurring(null, schema.parse(await readJson(request)));
  return ok({ id: r.id });
});
