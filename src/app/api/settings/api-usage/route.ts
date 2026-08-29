/**
 * Limites de custo e parametrização da integração com o Google Maps.
 *
 * Configuração de sistema: restrita a administrador. Os valores monetários
 * são colunas Decimal — passam por `num()` para chegar ao front como número,
 * e não como o objeto Decimal do driver, sobre o qual a tela chamava
 * `.toFixed()`.
 */
import { requireAdmin } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { badRequest } from '@/server/http/errors';
import { logger } from '@/server/http/logger';
import { ok, readJson, route } from '@/server/http/respond';
import { num, paginated, timestamp } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import { apiUsageQuerySchema, apiUsageUpdateSchema } from '@/server/validation/crm';

const DEFAULT_SETTINGS = {
  dailyCostLimit: 10.0,
  monthlyCostLimit: 150.0,
  currentDailyCost: 0.0,
  currentMonthlyCost: 0.0,
  apiPaused: false,
  nearbyRadiusKm: 5,
};

interface SettingsRow {
  id: string;
  dailyCostLimit: unknown;
  monthlyCostLimit: unknown;
  currentDailyCost: unknown;
  currentMonthlyCost: unknown;
  apiPaused: boolean;
  nearbyRadiusKm: number;
  whatsappTemplate: string;
}

function toSettingsDTO(row: SettingsRow) {
  const dailyLimit = num(row.dailyCostLimit);
  const monthlyLimit = num(row.monthlyCostLimit);
  const dailyCost = num(row.currentDailyCost);
  const monthlyCost = num(row.currentMonthlyCost);

  return {
    id: row.id,
    dailyCostLimit: dailyLimit,
    monthlyCostLimit: monthlyLimit,
    currentDailyCost: Number(dailyCost.toFixed(3)),
    currentMonthlyCost: Number(monthlyCost.toFixed(3)),
    apiPaused: row.apiPaused,
    nearbyRadiusKm: row.nearbyRadiusKm,
    whatsappTemplate: row.whatsappTemplate,
    dailyPercent: dailyLimit > 0 ? Math.min(100, Math.round((dailyCost / dailyLimit) * 100)) : 0,
    monthlyPercent:
      monthlyLimit > 0 ? Math.min(100, Math.round((monthlyCost / monthlyLimit) * 100)) : 0,
  };
}

export const GET = route('consumo-api.obter', async (request) => {
  await requireAdmin();
  const query = parseQuery(request, apiUsageQuerySchema);

  const settings: SettingsRow =
    (await prisma.systemSettings.findFirst()) ??
    (await prisma.systemSettings.create({ data: DEFAULT_SETTINGS }));

  const [recentUsage, total] = await Promise.all([
    prisma.apiUsage.findMany({
      orderBy: { date: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.apiUsage.count(),
  ]);

  // Colunas Decimal precisam passar por `num()`: cruas viram string no JSON,
  // e a tela chamava `.toFixed()` em cima.
  const linhas = recentUsage.map(
    (linha: {
      id: string;
      date: Date;
      service: string;
      endpoint: string;
      callCount: number;
      estimatedCost: unknown;
      region: string | null;
      executionId: string | null;
    }) => ({
      id: linha.id,
      date: timestamp(linha.date),
      service: linha.service,
      endpoint: linha.endpoint,
      callCount: linha.callCount,
      estimatedCost: num(linha.estimatedCost),
      region: linha.region,
      executionId: linha.executionId,
    }),
  );

  return ok({
    settings: toSettingsDTO(settings),
    ...paginated(linhas, total, query.page, query.pageSize),
  });
});

export const POST = route('consumo-api.atualizar', async (request) => {
  const session = await requireAdmin();
  const input = apiUsageUpdateSchema.parse(await readJson(request));

  const current: SettingsRow | null = await prisma.systemSettings.findFirst();
  if (!current) throw badRequest('Configurações de sistema não inicializadas.');

  const data: Record<string, unknown> = {};
  if (input.dailyCostLimit !== undefined) data.dailyCostLimit = input.dailyCostLimit;
  if (input.monthlyCostLimit !== undefined) data.monthlyCostLimit = input.monthlyCostLimit;
  if (input.apiPaused !== undefined) data.apiPaused = input.apiPaused;
  if (input.nearbyRadiusKm !== undefined) data.nearbyRadiusKm = input.nearbyRadiusKm;
  if (input.whatsappTemplate !== undefined) data.whatsappTemplate = input.whatsappTemplate;

  if (input.resetCosts === true) {
    data.currentDailyCost = 0;
    data.currentMonthlyCost = 0;
    // Zerar o contador sem reabrir a torneira deixaria a prospecção parada.
    data.apiPaused = false;
  }

  const updated: SettingsRow = await prisma.systemSettings.update({
    where: { id: current.id },
    data,
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'UPDATE_SYSTEM_SETTINGS',
      entity: 'SystemSettings',
      entityId: current.id,
      oldValue: current,
      newValue: updated,
    },
  });

  logger.info('configurações de custo de API atualizadas', {
    route: 'consumo-api.atualizar',
    userId: session.userId,
    resetCosts: input.resetCosts === true,
  });

  return ok({
    success: true,
    settings: toSettingsDTO(updated),
    message: 'Configurações de limites de custo e parametrizações salvas com sucesso.',
  });
});
