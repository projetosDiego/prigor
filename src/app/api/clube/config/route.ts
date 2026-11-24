import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { getSmsSettings, saveSmsSettings } from '@/server/services/loyalty-sms';
import { loyaltySmsSettingsSchema } from '@/server/validation/loyalty';

export const GET = route('clube.config.ver', async () => {
  await requireManager();
  return ok(await getSmsSettings());
});

export const PUT = route('clube.config.salvar', async (request) => {
  const session = await requireManager();
  await saveSmsSettings(session, loyaltySmsSettingsSchema.parse(await readJson(request)));
  return ok(await getSmsSettings());
});
