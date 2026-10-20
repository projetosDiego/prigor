import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { listAccounts, saveAccount } from '@/server/services/finance';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(['banco', 'dinheiro', 'outro']).optional(),
  openingBalance: z.number().min(-1e9).max(1e9).optional(),
  openingDate: iso.optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const GET = route('financeiro.contas.listar', async () => {
  await requireManager();
  return ok(await listAccounts());
});

export const POST = route('financeiro.contas.criar', async (request) => {
  await requireManager();
  const acc = await saveAccount(null, accountSchema.parse(await readJson(request)));
  return ok({ id: acc.id });
});
