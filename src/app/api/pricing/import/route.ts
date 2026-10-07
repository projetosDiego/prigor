import { requireAdmin } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingImportSchema } from '@/server/validation/precificacao';
import { importPricing } from '@/server/services/precificacao';

export const maxDuration = 60;

/** Importa o arquivo gerado a partir da planilha PreçoFácil. Só administrador. */
export const POST = route('precificacao.importar', async (request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const input = pricingImportSchema.parse(await readJson(request));
  return ok(await importPricing(input, url.searchParams.get('replaceFixedCosts') !== 'false'));
});
