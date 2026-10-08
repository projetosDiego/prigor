/** Editar empresa emissora (só administrador). */
import { requireAdmin } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { updateIssuer } from '@/server/services/issuers';
import { issuerUpdateSchema } from '@/server/validation/billing';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('empresas.editar', async (request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;
  const input = issuerUpdateSchema.parse(await readJson(request));
  return ok(await updateIssuer(session, id, input));
});
