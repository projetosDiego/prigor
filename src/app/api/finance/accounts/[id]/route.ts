import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { saveAccount } from '@/server/services/finance';

type Context = { params: Promise<{ id: string }> };
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(['banco', 'dinheiro', 'outro']).optional(),
  openingBalance: z.number().min(-1e9).max(1e9).optional(),
  openingDate: iso.optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const PATCH = route<Context>('financeiro.contas.editar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  await saveAccount(id, schema.parse(await readJson(request)));
  return ok({ id });
});
