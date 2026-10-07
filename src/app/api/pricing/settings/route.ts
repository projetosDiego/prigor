import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingSettingsSchema } from '@/server/validation/precificacao';
import { updatePricingSettings } from '@/server/services/precificacao';

export const PUT = route('precificacao.config', async (request) => {
  await requireManager();
  return ok(await updatePricingSettings(pricingSettingsSchema.parse(await readJson(request))));
});
