import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { reissueReward } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyReissueSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

/** Libera segunda via do prêmio (chamado do cliente pelo WhatsApp). */
export const POST = route<Context>('clube.cupom.segunda_via', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Cupom').parse((await params).id);
  const { reason } = loyaltyReissueSchema.parse(await readJson(request));
  await reissueReward(session, id, reason);
  return ok({ ok: true });
});
