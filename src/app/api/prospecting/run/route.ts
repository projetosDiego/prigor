/**
 * Disparo manual do motor de prospecção.
 *
 * O motor recusa rodar sem chave do Google quando o modo simulado está
 * desligado — e a mensagem dele explica exatamente o que configurar. Ela sobe
 * como 400, e não como 500 genérico: é erro de configuração, não falha do
 * servidor.
 */
import { requireManager } from '@/server/auth/guard';
import { runProspectingEngine } from '@/lib/places';
import { badRequest, isAppError } from '@/server/http/errors';
import { logger } from '@/server/http/logger';
import { ok, readJson, route } from '@/server/http/respond';
import { prospectingRunSchema } from '@/server/validation/crm';

export const POST = route('prospeccao.executar', async (request) => {
  const session = await requireManager();
  const input = prospectingRunSchema.parse(await readJson(request));

  let stats: Awaited<ReturnType<typeof runProspectingEngine>>;
  try {
    stats = await runProspectingEngine({
      neighborhoodId: input.neighborhoodId,
      category: input.category,
      manual: true,
      limit: input.limit,
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.warn('motor de prospecção recusou executar', {
      route: 'prospeccao.executar',
      userId: session.userId,
      neighborhoodId: input.neighborhoodId,
      error,
    });
    throw badRequest(
      error instanceof Error ? error.message : 'Não foi possível executar a prospecção.',
    );
  }

  if (!stats.success) {
    throw badRequest(
      'A prospecção terminou sem sucesso. Verifique o histórico de execuções para o motivo.',
    );
  }

  return ok({
    success: true,
    message: `Prospecção concluída com sucesso! Encontrados: ${stats.resultsFound}, Novos Leads: ${stats.newLeads}, Duplicados pulados: ${stats.duplicates}, Clientes atuais ignorados: ${stats.existingCustomers}.`,
    stats,
  });
});
