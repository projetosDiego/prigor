/**
 * Contexto para a prospecção diária via Claude: bairros ativos das regiões
 * cadastradas, com região e vendedor responsável. O robô usa isso para saber
 * ONDE procurar.
 */
import { requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';

export const GET = route('prospeccao.contexto', async () => {
  await requireManager();

  const neighborhoods = await prisma.neighborhood.findMany({
    where: { active: true, region: { active: true } },
    include: { region: { select: { name: true } }, seller: { select: { name: true } } },
    orderBy: [{ region: { name: 'asc' } }, { name: 'asc' }],
  });

  const data = neighborhoods.map(
    (n: {
      id: string;
      name: string;
      city: string;
      state: string;
      region: { name: string } | null;
      seller: { name: string } | null;
    }) => ({
      neighborhoodId: n.id,
      neighborhood: n.name,
      city: n.city,
      state: n.state,
      region: n.region?.name ?? null,
      seller: n.seller?.name ?? null,
    }),
  );

  return ok({ data });
});
