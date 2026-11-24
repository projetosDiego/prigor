import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { grantPrize } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyGrantSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('clube.membro.premio', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Membro').parse((await params).id);
  const { prizeId, note } = loyaltyGrantSchema.parse(await readJson(request));
  await grantPrize(session, id, prizeId, note);
  return ok({ ok: true });
});
