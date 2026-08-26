/**
 * Calibragem do score de leads.
 *
 * Configuração de sistema: restrita a administrador. A soma dos pesos tem de
 * fechar 100 — regra que agora vive no schema, não num `if` no meio da rota —
 * e toda alteração grava histórico e recalcula os leads ativos.
 */
import { requireAdmin } from '@/server/auth/guard';
import { recalculateAllLeadsScores } from '@/lib/scoring';
import { prisma } from '@/server/db';
import { logger } from '@/server/http/logger';
import { ok, readJson, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import { scoreHistoryQuerySchema, scoreWeightsSchema } from '@/server/validation/crm';

/** Distribuição inicial dos pesos, usada quando ainda não há configuração. */
const DEFAULT_WEIGHTS = {
  categoryWeight: 25,
  compatibilityWeight: 20,
  commercialWeight: 15,
  regionWeight: 15,
  digitalWeight: 10,
  nearbyWeight: 10,
  dataQualityWeight: 5,
};

export const GET = route('score.obter', async (request) => {
  await requireAdmin();
  const query = parseQuery(request, scoreHistoryQuerySchema);

  const settings =
    (await prisma.scoreSettings.findFirst()) ??
    (await prisma.scoreSettings.create({ data: DEFAULT_WEIGHTS }));

  const [history, total] = await Promise.all([
    prisma.scoreHistory.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.scoreHistory.count(),
  ]);

  return ok({
    settings,
    ...paginated(history, total, query.page, query.pageSize),
    // Alias de compatibilidade com a tela de calibragem.
    history,
  });
});

export const POST = route('score.calibrar', async (request) => {
  const session = await requireAdmin();
  const input = scoreWeightsSchema.parse(await readJson(request));

  const weights = {
    categoryWeight: input.categoryWeight,
    compatibilityWeight: input.compatibilityWeight,
    commercialWeight: input.commercialWeight,
    regionWeight: input.regionWeight,
    digitalWeight: input.digitalWeight,
    nearbyWeight: input.nearbyWeight,
    dataQualityWeight: input.dataQualityWeight,
  };

  const current = await prisma.scoreSettings.findFirst();

  const updated = current
    ? await prisma.scoreSettings.update({ where: { id: current.id }, data: weights })
    : await prisma.scoreSettings.create({ data: weights });

  await prisma.scoreHistory.create({
    data: {
      weights,
      updatedBy: session.name,
      reason: input.reason ?? 'Ajuste de calibragem de score.',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'CHANGE_SCORE_WEIGHTS',
      entity: 'ScoreSettings',
      entityId: updated.id,
      oldValue: current,
      newValue: updated,
    },
  });

  // Peso novo sem recálculo deixaria a fila de leads ordenada pelo critério antigo.
  const recalculatedCount = await recalculateAllLeadsScores();

  logger.info('pesos de score recalibrados', {
    route: 'score.calibrar',
    userId: session.userId,
    recalculatedCount,
  });

  return ok({
    success: true,
    settings: updated,
    recalculatedCount,
    message: `Pesos salvos com sucesso. ${recalculatedCount} leads ativos foram recalculados.`,
  });
});
