import { hashLoyaltyToken, setLoyaltyCookie } from '@/server/auth/loyalty-session';
import { rateLimited } from '@/server/http/errors';
import { clientIp, hit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { getMemberView, resetPinWithCode } from '@/server/services/loyalty';
import { loyaltyPinResetSchema } from '@/server/validation/loyalty';

/** Esqueci o PIN: código SMS + PIN novo, e já entra. */
export const POST = route('public.clube.pin.redefinir', async (request) => {
  if (!hit(`clube:pin-reset:${clientIp(request)}`, 20, 3600).allowed) throw rateLimited();
  const { phone, code, pin } = loyaltyPinResetSchema.parse(await readJson(request));
  const { token } = await resetPinWithCode(phone, code, pin);
  await setLoyaltyCookie(token);
  return ok({ member: await getMemberView(hashLoyaltyToken(token)) });
});
