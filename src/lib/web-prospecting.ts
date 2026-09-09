/**
 * Prospecção via Claude (busca na web).
 *
 * O Claude pesquisa estabelecimentos na web e envia os candidatos para
 * `ingestWebLeads`, que reaproveita a mesma deduplicação, score e distribuição
 * territorial do motor do Google (src/lib/places.ts), sem custo de API.
 */
import { prisma } from '@/server/db';
import { errorMessage } from './errors';
import { calculateLeadScore, type ScoreWeights } from './scoring';
import { PipelineStage, Prisma } from '@prisma/client';

// ─── Prospecção via Claude (busca na web) ────────────────────────────────────
// O Claude pesquisa estabelecimentos na web e envia os candidatos aqui. Esta
// função reaproveita a mesma deduplicação, score e distribuição territorial do
// motor do Google, sem custo de API.

const NEIGHBORHOOD_CENTERS: Record<string, [number, number]> = {
  'méier': [-22.9015, -43.2798],
  'meier': [-22.9015, -43.2798],
  'cachambi': [-22.8906, -43.2750],
  'tijuca': [-22.9234, -43.2356],
  'copacabana': [-22.9691, -43.1873],
  'ipanema': [-22.984, -43.2012],
  'botafogo': [-22.9515, -43.1802],
  'lapa': [-22.9135, -43.1825],
};

function centerForNeighborhood(name: string): [number, number] {
  const n = name.toLowerCase();
  for (const key of Object.keys(NEIGHBORHOOD_CENTERS)) {
    if (n.includes(key)) return NEIGHBORHOOD_CENTERS[key];
  }
  return [-22.9068, -43.1729];
}

export interface WebLeadInput {
  tradeName: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  phone?: string;
  website?: string;
  zipCode?: string;
}

/** Resolve o bairro por id OU por nome (criando bairro/região se faltar). */
async function resolveNeighborhood(opts: {
  neighborhoodId?: string;
  neighborhoodName?: string;
  regionName?: string;
  city?: string;
  state?: string;
}) {
  const city = opts.city || 'Rio de Janeiro';
  const state = opts.state || 'RJ';
  if (opts.neighborhoodId) {
    const n = await prisma.neighborhood.findUnique({ where: { id: opts.neighborhoodId }, include: { region: true } });
    if (!n) throw new Error('Bairro selecionado não existe.');
    return n;
  }
  const name = (opts.neighborhoodName || '').trim();
  if (!name) throw new Error('Informe o bairro (id ou nome).');
  const found = await prisma.neighborhood.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, city, state },
    include: { region: true },
  });
  if (found) return found;
  const regName = (opts.regionName || 'Prospecção Automática').trim();
  let region = await prisma.region.findFirst({ where: { name: { equals: regName, mode: 'insensitive' } } });
  if (!region) region = await prisma.region.create({ data: { name: regName } });
  return prisma.neighborhood.create({
    data: { name, city, state, regionId: region.id },
    include: { region: true },
  });
}

export async function ingestWebLeads(params: {
  neighborhoodId?: string;
  neighborhoodName?: string;
  regionName?: string;
  city?: string;
  state?: string;
  category: string;
  places: WebLeadInput[];
  source?: string;
}): Promise<{
  runId: string;
  neighborhoodId: string;
  neighborhood: string;
  resultsFound: number;
  newLeads: number;
  duplicates: number;
  existingCustomers: number;
}> {
  const { category, places, source = 'AUTOMATIC' } = params;

  const neighborhood = await resolveNeighborhood(params);

  const [centerLat, centerLng] = centerForNeighborhood(neighborhood.name);

  const run = await prisma.prospectingRun.create({
    data: {
      regionId: neighborhood.regionId,
      neighborhoodId: neighborhood.id,
      category,
      query: `${category} em ${neighborhood.name} (busca web/Claude)`,
      status: 'RUNNING',
    },
  });

  let newLeadsCount = 0;
  let duplicatesCount = 0;
  let existingCustCount = 0;

  try {
    const scoreSettings: ScoreWeights | null = await prisma.scoreSettings.findFirst();
    const activeCustomers = (
      await prisma.customer.findMany({
        where: { status: 'ATIVO' },
        select: { latitude: true, longitude: true },
      })
    ).filter(
      (c: { latitude: number | null; longitude: number | null }): c is { latitude: number; longitude: number } =>
        c.latitude !== null && c.longitude !== null,
    );

    const scoreWeights: ScoreWeights = scoreSettings || {
      categoryWeight: 25,
      compatibilityWeight: 20,
      commercialWeight: 15,
      regionWeight: 15,
      digitalWeight: 10,
      nearbyWeight: 10,
      dataQualityWeight: 5,
    };

    for (const place of places) {
      const name = (place.tradeName || '').trim();
      if (!name) continue;
      const addr = (place.address || '').trim();

      const existingCustomer = await prisma.customer.findFirst({
        where: {
          OR: [
            place.phone ? { phone: place.phone } : { id: 'dummy' },
            { tradeName: { equals: name, mode: 'insensitive' } },
          ],
        },
      });
      if (existingCustomer) {
        existingCustCount++;
        continue;
      }

      const existingLead = await prisma.lead.findFirst({
        where: {
          OR: [
            place.phone ? { phone: place.phone } : { id: 'dummy' },
            { tradeName: { equals: name, mode: 'insensitive' } },
          ],
        },
      });
      if (existingLead) {
        duplicatesCount++;
        continue;
      }

      const { score, breakdown } = await calculateLeadScore(
        {
          category,
          latitude: centerLat,
          longitude: centerLng,
          regionId: neighborhood.regionId,
          tradeName: name,
          phone: place.phone,
          website: place.website,
        },
        scoreWeights,
        activeCustomers,
      );

      const sellerId = neighborhood.sellerId;
      const leadStatus = sellerId ? 'ATIVO' : 'SEM_TERRITORIO';
      const leadStage = sellerId ? PipelineStage.ATRIBUIDO : PipelineStage.NOVO;

      await prisma.lead.create({
        data: {
          tradeName: name,
          address: addr || neighborhood.name,
          number: place.number || null,
          neighborhood: place.neighborhood || neighborhood.name,
          city: neighborhood.city,
          state: neighborhood.state,
          zipCode: place.zipCode || null,
          latitude: centerLat,
          longitude: centerLng,
          category,
          phone: place.phone || null,
          score,
          scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          sellerId,
          regionId: neighborhood.regionId,
          neighborhoodId: neighborhood.id,
          pipelineStage: leadStage,
          source,
          status: leadStatus,
          priority: score >= 80 ? 'ALTA' : score >= 50 ? 'MEDIA' : 'BAIXA',
        },
      });
      newLeadsCount++;
    }

    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        resultsFound: places.length,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        existingCust: existingCustCount,
        estimatedCost: 0,
        status: 'SUCCESS',
      },
    });
  } catch (error: unknown) {
    await prisma.prospectingRun
      .update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: 'FAILED',
          errors: errorMessage(error) || 'Erro na ingestão de leads da web.',
        },
      })
      .catch(() => undefined);
    throw error;
  }

  return {
    runId: run.id,
    neighborhoodId: neighborhood.id,
    neighborhood: neighborhood.name,
    resultsFound: places.length,
    newLeads: newLeadsCount,
    duplicates: duplicatesCount,
    existingCustomers: existingCustCount,
  };
}
