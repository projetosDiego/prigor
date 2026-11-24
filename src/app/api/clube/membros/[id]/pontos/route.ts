import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { adjustMemberPoints } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyPointsAdjustSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('clube.membro.pontos', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Membro').parse((await params).id);
  const { delta, description } = loyaltyPointsAdjustSchema.parse(await readJson(request));
  await adjustMemberPoints(session, id, delta, description);
  return ok({ ok: true });
});
