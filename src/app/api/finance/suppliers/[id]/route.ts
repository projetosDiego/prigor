import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { saveSupplier } from '@/server/services/finance';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  document: z.string().trim().max(30).nullish(),
  phone: z.string().trim().max(30).nullish(),
  notes: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
});

export const PATCH = route<Context>('financeiro.fornecedores.editar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  await saveSupplier(id, schema.parse(await readJson(request)));
  return ok({ id });
});
