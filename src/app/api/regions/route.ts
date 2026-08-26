/**
 * Regiões comerciais.
 *
 * A listagem não exigia sessão nenhuma: qualquer um na rede conseguia ler o
 * mapa territorial da empresa, com bairros e tudo. Agora exige usuário
 * autenticado, e a escrita é de gestão.
 */
import { requireManager, requireUser } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { conflict } from '@/server/http/errors';
import { created, ok, readJson, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import { regionInputSchema, regionListQuerySchema } from '@/server/validation/crm';

export const GET = route('regioes.listar', async (request) => {
  await requireUser();
  const query = parseQuery(request, regionListQuerySchema);

  const where = query.activeOnly ? { active: true } : {};

  const [rows, total] = await Promise.all([
    prisma.region.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        neighborhoods: { select: { id: true, name: true, active: true } },
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.region.count({ where }),
  ]);

  return ok({
    ...paginated(rows, total, query.page, query.pageSize),
  });
});

export const POST = route('regioes.criar', async (request) => {
  const session = await requireManager();
  const input = regionInputSchema.parse(await readJson(request));

  const existing = await prisma.region.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  if (existing) throw conflict('Uma região com este nome já existe.');

  const region = await prisma.region.create({
    data: {
      name: input.name,
      description: input.description,
      active: input.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'CREATE_REGION',
      entity: 'Region',
      entityId: region.id,
      newValue: region,
    },
  });

  return created({ success: true, region });
});
