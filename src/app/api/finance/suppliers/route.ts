import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { listSuppliers, saveSupplier } from '@/server/services/finance';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  document: z.string().trim().max(30).nullish(),
  phone: z.string().trim().max(30).nullish(),
  notes: z.string().trim().max(500).nullish(),
});

export const GET = route('financeiro.fornecedores.listar', async () => {
  await requireManager();
  return ok(await listSuppliers());
});

export const POST = route('financeiro.fornecedores.criar', async (request) => {
  await requireManager();
  const s = await saveSupplier(null, schema.parse(await readJson(request)));
  return ok({ id: s.id });
});
