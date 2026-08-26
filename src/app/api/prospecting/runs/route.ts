/**
 * Histórico de execuções da prospecção.
 *
 * Dado consolidado da operação (custo de API, volume gerado): leitura de
 * gestão. O `take: 20` fixo virou paginação de verdade.
 */
import { requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
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

  return ok({
    ...paginated(rows, total, query.page, query.pageSize),
  });
});
