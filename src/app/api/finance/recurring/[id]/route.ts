import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { deleteRecurring, saveRecurring } from '@/server/services/finance';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  description: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  value: z.number().positive().max(1e9).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  supplierId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
  active: z.boolean().optional(),
});

export const PATCH = route<Context>('financeiro.recorrentes.editar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  await saveRecurring(id, schema.parse(await readJson(request)));
  return ok({ id });
});

export const DELETE = route<Context>('financeiro.recorrentes.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteRecurring(id);
  return ok({ deleted: true });
});
