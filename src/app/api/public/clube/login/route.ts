import { hashLoyaltyToken, setLoyaltyCookie } from '@/server/auth/loyalty-session';
import { rateLimited } from '@/server/http/errors';
import { clientIp, hit, reset } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { getMemberView, loginMember } from '@/server/services/loyalty';
import { loyaltyLoginSchema } from '@/server/validation/loyalty';

/** Login do cliente do Clube: celular + PIN de 4 dígitos. */
export const POST = route('public.clube.login', async (request) => {
  const { phone, pin } = loyaltyLoginSchema.parse(await readJson(request));
  // PIN tem só 10 mil combinações: 5 tentativas por celular a cada 15 min + teto por rede.
  const byPhone = hit(`clube:login:${phone}`, 5, 900);
  const byIp = hit(`clube:login-ip:${clientIp(request)}`, 30, 900);
  if (!byPhone.allowed || !byIp.allowed) throw rateLimited('Muitas tentativas. Espere 15 minutos ou fale com a Prigor.');
  const { token } = await loginMember(phone, pin);
  reset(`clube:login:${phone}`);
  await setLoyaltyCookie(token);
  return ok({ member: await getMemberView(hashLoyaltyToken(token)) });
});
