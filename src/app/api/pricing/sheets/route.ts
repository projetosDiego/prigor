import { requireManager } from '@/server/auth/guard';
import { created, readJson, route } from '@/server/http/respond';
import { pricingSheetSchema } from '@/server/validation/precificacao';
import { createSheet } from '@/server/services/precificacao';

export const POST = route('precificacao.ficha.criar', async (request) => {
  await requireManager();
  const input = pricingSheetSchema.parse(await readJson(request));
  return created(await createSheet(input));
});
