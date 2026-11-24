import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { reviewSubmission } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyReviewSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

/** Aprova (credita os pontos) ou recusa o print. */
export const POST = route<Context>('clube.envios.analisar', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Envio').parse((await params).id);
  const { approve, note } = loyaltyReviewSchema.parse(await readJson(request));
  await reviewSubmission(session, id, approve, note);
  return ok({ ok: true });
});
