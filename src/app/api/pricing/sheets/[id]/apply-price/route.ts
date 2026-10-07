import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { applySheetPrice } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

const bodySchema = z.object({ price: z.number().positive().max(1_000_000).optional() });

export const POST = route<Context>('precificacao.ficha.aplicar-preco', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const body = bodySchema.parse(await readJson(request).catch(() => ({})));
  return ok(await applySheetPrice(id, body.price));
});
