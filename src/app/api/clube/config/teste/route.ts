import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { sendTestSms } from '@/server/services/loyalty-sms';
import { loyaltySmsTestSchema } from '@/server/validation/loyalty';

export const POST = route('clube.config.teste', async (request) => {
  const session = await requireManager();
  const { phone } = loyaltySmsTestSchema.parse(await readJson(request));
  return ok(await sendTestSms(session, phone));
});
