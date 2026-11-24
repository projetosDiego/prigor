import { hashLoyaltyToken, setLoyaltyCookie } from '@/server/auth/loyalty-session';
import { rateLimited } from '@/server/http/errors';
import { clientIp, hit } from '@/server/http/rate-limit';
import { created, readJson, route } from '@/server/http/respond';
import { getMemberView, signupMember } from '@/server/services/loyalty';
import { loyaltySignupSchema } from '@/server/validation/loyalty';

/** Cadastro do cliente final no Clube Prigor (público, sem login) com sorteio do prêmio. */
export const POST = route('public.clube.cadastro', async (request) => {
  // Freio contra robô: 8 cadastros por IP a cada hora.
  if (!hit(`clube:cadastro:${clientIp(request)}`, 8, 3600).allowed) {
    throw rateLimited('Muitos cadastros a partir desta rede. Tente de novo mais tarde.');
  }
  const input = loyaltySignupSchema.parse(await readJson(request));
  const { token, prizeTitle } = await signupMember(input);
  await setLoyaltyCookie(token);
  return created({ prizeTitle, member: await getMemberView(hashLoyaltyToken(token)) });
});
