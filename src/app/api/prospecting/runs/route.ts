/**
 * Histórico de execuções da prospecção.
 *
 * Dado consolidado da operação (custo de API, volume gerado): leitura de
 * gestão. O `take: 20` fixo virou paginação de verdade.
 */
import { requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { num, paginated, timestamp } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import { prospectingRunsQuerySchema } from '@/server/validation/crm';

export const GET = route('prospeccao.execucoes', async (request) => {
  await requireManager();
  const query = parseQuery(request, prospectingRunsQuerySchema);

  const [rows, total] = await Promise.all([
    prisma.prospectingRun.findMany({
      orderBy: { startedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.prospectingRun.count(),
  ]);

  // `estimatedCost` é Decimal: sem `num()` sai como string no JSON.
  const execucoes = rows.map(
    (linha: {
      id: string;
      startedAt: Date;
      finishedAt: Date | null;
      category: string | null;
      query: string | null;
      resultsFound: number;
      newLeads: number;
      duplicates: number;
      existingCust: number;
      errors: string | null;
      estimatedCost: unknown;
      simulated: boolean;
      status: string;
    }) => ({
      id: linha.id,
      startedAt: timestamp(linha.startedAt),
      finishedAt: timestamp(linha.finishedAt),
      category: linha.category,
      query: linha.query,
      resultsFound: linha.resultsFound,
      newLeads: linha.newLeads,
      duplicates: linha.duplicates,
      existingCust: linha.existingCust,
      errors: linha.errors,
      estimatedCost: num(linha.estimatedCost),
      simulated: linha.simulated,
      status: linha.status,
    }),
  );

  return ok({
    ...paginated(execucoes, total, query.page, query.pageSize),
  });
});
