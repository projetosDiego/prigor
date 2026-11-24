import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { setPointStock } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyStockSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ customerId: string }> };

/** Quantas unidades do brinde limitado o ponto recebeu (ex.: 10 bolsas). */
export const PUT = route<Context>('clube.ponto.estoque', async (request, { params }) => {
  const session = await requireManager();
  const customerId = uuid('Cliente').parse((await params).customerId);
  const { prizeId, quantity } = loyaltyStockSchema.parse(await readJson(request));
  await setPointStock(session, customerId, prizeId, quantity);
  return ok({ ok: true });
});
