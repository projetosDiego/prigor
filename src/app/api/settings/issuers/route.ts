/**
 * Empresas emissoras (CNPJs que emitem NF e boleto).
 * GET: gerência (lista para o faturamento). POST: só administrador.
 */
import { requireAdmin, requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { createIssuer, listIssuers } from '@/server/services/issuers';
import { issuerSchema } from '@/server/validation/billing';

export const GET = route('empresas.listar', async (request) => {
  await requireManager();
  const all = new URL(request.url).searchParams.get('todas') === '1';
  return ok({ data: await listIssuers({ includeInactive: all }) });
});

export const POST = route('empresas.criar', async (request) => {
  const session = await requireAdmin();
  const input = issuerSchema.parse(await readJson(request));
  return created(await createIssuer(session, input));
});
