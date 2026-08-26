import { z } from 'zod';

import { requireManager, requireUser } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { sellerUpdateSchema } from '@/server/validation/sales';
import { deactivateSeller, getSeller, updateSeller } from '@/server/services/sellers';

type Context = { params: Promise<{ id: string }> };

const updateSchema = sellerUpdateSchema.and(
  z.object({ password: z.string().min(8).max(200).optional() }),
);

export const GET = route<Context>('vendedores.obter', async (_request, { params }) => {
  await requireUser();
  const { id } = await params;
  return ok(await getSeller(id));
});

export const PATCH = route<Context>('vendedores.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = updateSchema.parse(await readJson(request));
  return ok(await updateSeller(id, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('vendedores.desativar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deactivateSeller(id);
  return ok({ ok: true });
});
