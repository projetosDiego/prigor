/**
 * Configuração fiscal da empresa e situação das integrações (Sicoob, NF).
 * GET: gerência. PUT: só administrador.
 */
import { requireAdmin, requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { getFiscalSettings, updateFiscalSettings } from '@/server/services/fiscal-settings';
import { fiscalSettingsUpdateSchema } from '@/server/validation/billing';

export const GET = route('config_fiscal.obter', async () => {
  await requireManager();
  return ok(await getFiscalSettings());
});

export const PUT = route('config_fiscal.salvar', async (request) => {
  const session = await requireAdmin();
  const input = fiscalSettingsUpdateSchema.parse(await readJson(request));
  return ok(await updateFiscalSettings(session, input));
});
