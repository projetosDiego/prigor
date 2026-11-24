import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { listPrizes, savePrize } from '@/server/services/loyalty-admin';
import { loyaltyPrizeSchema } from '@/server/validation/loyalty';

export const GET = route('clube.premios.listar', async () => {
  await requireManager();
  return ok({ data: await listPrizes() });
});

export const POST = route('clube.premios.criar', async (request) => {
  const session = await requireManager();
  await savePrize(session, null, loyaltyPrizeSchema.parse(await readJson(request)));
  return created({ ok: true });
});
