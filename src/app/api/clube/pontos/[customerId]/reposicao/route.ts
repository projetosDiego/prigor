import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { settlePointBonus } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltySettleSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ customerId: string }> };

/** Marca como reposta a bonificação pendente do ponto. */
export const POST = route<Context>('clube.ponto.repor', async (request, { params }) => {
  const session = await requireManager();
  const customerId = uuid('Cliente').parse((await params).customerId);
  const { orderNumber } = loyaltySettleSchema.parse(await readJson(request));
  return ok(await settlePointBonus(session, customerId, orderNumber ?? null));
});
