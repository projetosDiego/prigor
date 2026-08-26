/**
 * Bairros (territórios).
 *
 * Como em regiões, a listagem era pública dentro da rede — agora exige sessão.
 * Cadastrar bairro é ato de gestão: define de quem é o território.
 */
import { requireManager, requireUser } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { conflict } from '@/server/http/errors';
import { created, ok, readJson, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import {
  neighborhoodInputSchema,
  neighborhoodListQuerySchema,
} from '@/server/validation/crm';

export const GET = route('bairros.listar', async (request) => {
  await requireUser();
  const query = parseQuery(request, neighborhoodListQuerySchema);

  const where = {
    ...(query.regionId ? { regionId: query.regionId } : {}),
    ...(query.sellerId ? { sellerId: query.sellerId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.neighborhood.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.neighborhood.count({ where }),
  ]);

  return ok({
    ...paginated(rows, total, query.page, query.pageSize),
  });
});

export const POST = route('bairros.criar', async (request) => {
  const session = await requireManager();
  const input = neighborhoodInputSchema.parse(await readJson(request));

  const existing = await prisma.neighborhood.findUnique({
    where: {
      name_city_state: { name: input.name, city: input.city, state: input.state },
    },
    select: { id: true },
  });
  if (existing) throw conflict('Este bairro já está cadastrado nesta cidade e estado.');

  const neighborhood = await prisma.neighborhood.create({
    data: {
      name: input.name,
      city: input.city,
      state: input.state,
      regionId: input.regionId,
      sellerId: input.sellerId,
      active: input.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: input.sellerId ? 'ASSIGN_NEIGHBORHOOD' : 'CREATE_NEIGHBORHOOD',
      entity: 'Neighborhood',
      entityId: neighborhood.id,
      newValue: input.sellerId
        ? { sellerId: input.sellerId, neighborhoodName: input.name }
        : neighborhood,
    },
  });

  return created({ success: true, neighborhood });
});
