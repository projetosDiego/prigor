import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { createSheetFromProduct, createSheetsForAllProducts } from '@/server/services/precificacao';

const bodySchema = z.union([z.object({ productId: z.string().uuid() }), z.object({ all: z.literal(true) })]);

/** Cria a ficha técnica a partir do produto cadastrado (e da receita dele), de um ou de todos. */
export const POST = route('precificacao.ficha.do-produto', async (request) => {
  await requireManager();
  const body = bodySchema.parse(await readJson(request));
  if ('all' in body) return ok(await createSheetsForAllProducts());
  return ok(await createSheetFromProduct(body.productId));
});
