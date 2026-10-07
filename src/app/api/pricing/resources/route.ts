import { requireManager } from '@/server/auth/guard';
import { created, readJson, route } from '@/server/http/respond';
import { pricingResourceSchema } from '@/server/validation/precificacao';
import { createResource } from '@/server/services/precificacao';

export const POST = route('precificacao.recurso.criar', async (request) => {
  await requireManager();
  const input = pricingResourceSchema.parse(await readJson(request));
  return created(await createResource(input));
});
