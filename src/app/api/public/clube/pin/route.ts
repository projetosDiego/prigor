import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { ok, readJson, route } from '@/server/http/respond';
import { setMemberPin } from '@/server/services/loyalty';
import { loyaltyPinSchema } from '@/server/validation/loyalty';

/** Cria o PIN de quem ainda não tem (cadastros antigos). */
export const POST = route('public.clube.pin', async (request) => {
  const { pin } = loyaltyPinSchema.parse(await readJson(request));
  return ok({ member: await setMemberPin(await currentLoyaltyHash(), pin) });
});
