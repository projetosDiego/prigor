import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { savePrize } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyPrizeSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('clube.premios.editar', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Prêmio').parse((await params).id);
  await savePrize(session, id, loyaltyPrizeSchema.parse(await readJson(request)));
  return ok({ ok: true });
});
