import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { createReturn, orderReturns } from '@/server/services/returns';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  itemId: z.string().uuid(),
  units: z.number().positive().max(100_000),
  kind: z.enum(['troca', 'devolucao']),
  reason: z.string().max(200).nullish(),
});

export const GET = route<Context>('pedidos.trocas.listar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  return ok(await orderReturns(id));
});

export const POST = route<Context>('pedidos.trocas.criar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return ok(await createReturn(session, id, bodySchema.parse(await readJson(request))));
});
