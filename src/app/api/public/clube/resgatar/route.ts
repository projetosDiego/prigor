import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { rateLimited } from '@/server/http/errors';
import { clientIp, hit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { redeemReward } from '@/server/services/loyalty';
import { loyaltyRedeemSchema } from '@/server/validation/loyalty';

/** O próprio cliente resgata o cupom no ponto (o revendedor só vê a tela). */
export const POST = route('public.clube.resgatar', async (request) => {
  if (!hit(`clube:resgate:${clientIp(request)}`, 30, 3600).allowed) throw rateLimited();
  const { rewardId, pointCode } = loyaltyRedeemSchema.parse(await readJson(request));
  return ok({ member: await redeemReward(await currentLoyaltyHash(), rewardId, pointCode) });
});
