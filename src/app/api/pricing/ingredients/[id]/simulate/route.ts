import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { simulateIngredientPrice } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  purchasePrice: z.union([z.number(), z.string()]).transform((v) => Number(String(v).replace(',', '.'))).pipe(z.number().min(0).max(1_000_000)),
});

/** Simula o impacto de um novo preço de compra nas fichas (não grava nada). */
export const POST = route<Context>('precificacao.insumo.simular', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const { purchasePrice } = schema.parse(await readJson(request));
  return ok(await simulateIngredientPrice(id, purchasePrice));
});
