import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { ok, readJson, route } from '@/server/http/respond';
import { exchangePoints } from '@/server/services/loyalty';
import { loyaltyExchangeSchema } from '@/server/validation/loyalty';

/** Troca pontos por um prêmio do catálogo. */
export const POST = route('public.clube.trocar', async (request) => {
  const { prizeId } = loyaltyExchangeSchema.parse(await readJson(request));
  return ok({ member: await exchangePoints(await currentLoyaltyHash(), prizeId) });
});
