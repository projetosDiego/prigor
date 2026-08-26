/**
 * Painel gerencial do CRM.
 *
 * Antes este endpoint disparava duas consultas por vendedor, uma por bairro e
 * uma por categoria — dezenas de idas ao banco para montar uma tela. Agora são
 * agregações por `groupBy` resolvidas em paralelo e cruzadas por `Map`.
 *
 * É leitura consolidada da empresa inteira: gestão apenas.
 */
import { requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { type PipelineStageValue } from '@/server/validation/crm';

interface StageGroup {
  pipelineStage: PipelineStageValue;
  _count: { _all: number };
}

interface SellerRow {
  id: string;
  name: string;
  goal: number;
  _count: { leads: number; customers: number; activities: number };
}

interface GroupCount {
  _count: { _all: number };
}

type NeighborhoodGroup = GroupCount & { neighborhood: string };
type CategoryGroup = GroupCount & { category: string };
type SellerGroup = GroupCount & { sellerId: string | null };

const EMPTY_FUNNEL: Record<PipelineStageValue, number> = {
  NOVO: 0,
  QUALIFICADO: 0,
  ATRIBUIDO: 0,
  ABORDADO: 0,
  CONTATO_REALIZADO: 0,
  INTERESSADO: 0,
  REUNIAO: 0,
  AMOSTRA: 0,
  NEGOCIACAO: 0,
  NOVO_REVENDEDOR: 0,
  PERDIDO: 0,
};

function rate(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

export const GET = route('painel.gestao', async () => {
  await requireManager();

  const converted = { pipelineStage: 'NOVO_REVENDEDOR' as const };

  const [
    stageCounts,
    totalLeads,
    totalCustomers,
    activeSellersCount,
    convertedLeads,
    sellers,
    conversionsBySeller,
    visitsBySeller,
    leadsByNeighborhood,
    conversionsByNeighborhood,
    leadsByCategory,
    conversionsByCategory,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['pipelineStage'], _count: { _all: true } }),
    prisma.lead.count(),
    prisma.customer.count(),
    prisma.seller.count({ where: { active: true } }),
    prisma.lead.findMany({
      where: { ...converted, convertedCustomerId: { not: null } },
      select: { createdAt: true, updatedAt: true },
    }),
    prisma.seller.findMany({
      select: {
        id: true,
        name: true,
        goal: true,
        _count: { select: { leads: true, customers: true, activities: true } },
      },
    }),
    prisma.lead.groupBy({ by: ['sellerId'], where: converted, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ['sellerId'], where: { type: 'VISIT' }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['neighborhood'], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['neighborhood'], where: converted, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['category'], where: converted, _count: { _all: true } }),
  ]);

  const funnel: Record<PipelineStageValue, number> = { ...EMPTY_FUNNEL };
  for (const item of stageCounts as StageGroup[]) {
    funnel[item.pipelineStage] = item._count._all;
  }

  // Tempo médio entre a criação do lead e a mudança final de estágio.
  let avgConversionTimeDays = 0;
  const convertedRows = convertedLeads as Array<{ createdAt: Date; updatedAt: Date }>;
  if (convertedRows.length > 0) {
    const totalMs = convertedRows.reduce(
      (sum: number, lead: { createdAt: Date; updatedAt: Date }) =>
        sum + (lead.updatedAt.getTime() - lead.createdAt.getTime()),
      0,
    );
    avgConversionTimeDays = Number((totalMs / convertedRows.length / 86_400_000).toFixed(1));
  }

  const conversionsBySellerId = new Map<string, number>(
    (conversionsBySeller as SellerGroup[])
      .filter((row): row is SellerGroup & { sellerId: string } => row.sellerId !== null)
      .map((row) => [row.sellerId, row._count._all]),
  );
  const visitsBySellerId = new Map<string, number>(
    (visitsBySeller as SellerGroup[])
      .filter((row): row is SellerGroup & { sellerId: string } => row.sellerId !== null)
      .map((row) => [row.sellerId, row._count._all]),
  );

  const sellerPerformance = (sellers as SellerRow[]).map((seller) => {
    const conversions = conversionsBySellerId.get(seller.id) ?? 0;
    return {
      id: seller.id,
      name: seller.name,
      leadsReceived: seller._count.leads,
      visitsLogged: visitsBySellerId.get(seller.id) ?? 0,
      conversions,
      goal: seller.goal,
      conversionRate: rate(conversions, seller._count.leads),
    };
  });

  const conversionsByNeighborhoodName = new Map<string, number>(
    (conversionsByNeighborhood as NeighborhoodGroup[]).map((row) => [
      row.neighborhood,
      row._count._all,
    ]),
  );

  const neighborhoodPerformance = (leadsByNeighborhood as NeighborhoodGroup[])
    .map((row) => {
      const total = row._count._all;
      const conversions = conversionsByNeighborhoodName.get(row.neighborhood) ?? 0;
      return {
        neighborhood: row.neighborhood,
        totalLeads: total,
        conversions,
        conversionRate: rate(conversions, total),
      };
    })
    .sort((a, b) => b.totalLeads - a.totalLeads)
    .slice(0, 10);

  const conversionsByCategoryName = new Map<string, number>(
    (conversionsByCategory as CategoryGroup[]).map((row) => [row.category, row._count._all]),
  );

  const categoryPerformance = (leadsByCategory as CategoryGroup[])
    .map((row) => {
      const total = row._count._all;
      const conversions = conversionsByCategoryName.get(row.category) ?? 0;
      return {
        category: row.category,
        totalLeads: total,
        conversions,
        conversionRate: rate(conversions, total),
      };
    })
    .sort((a, b) => b.totalLeads - a.totalLeads);

  return ok({
    success: true,
    summary: {
      totalLeads,
      totalCustomers,
      activeSellersCount,
      conversionRate: rate(funnel.NOVO_REVENDEDOR, totalLeads),
      avgConversionTimeDays,
    },
    funnel,
    sellerPerformance,
    neighborhoodPerformance,
    categoryPerformance,
  });
});
