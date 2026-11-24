import { rateLimited } from '@/server/http/errors';
import { clientIp, hit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { requestPhoneCode } from '@/server/services/loyalty-sms';
import { loyaltyCodeRequestSchema } from '@/server/validation/loyalty';

/** Envia o código SMS (cadastro ou "esqueci meu PIN"). */
export const POST = route('public.clube.codigo', async (request) => {
  const ip = clientIp(request);
  if (!hit(`clube:sms-ip:${ip}`, 10, 3600).allowed) throw rateLimited('Muitos códigos pedidos a partir desta rede. Tente mais tarde.');
  const { phone, purpose } = loyaltyCodeRequestSchema.parse(await readJson(request));
  return ok(await requestPhoneCode(phone, purpose, ip));
});
