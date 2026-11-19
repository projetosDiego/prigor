/**
 * "Perto de mim": o vendedor descobre estabelecimentos ao redor de onde está
 * e eles entram na carteira dele como leads.
 *
 * Orquestra persistência; a geografia (raio, bairro do endereço) mora em
 * `domain/geo.ts` e as regras de dedup/custo em `lib/places.ts`, as mesmas do
 * motor de prospecção — um lead achado no campo e um achado pelo robô passam
 * pelo mesmo filtro.
 */
import { PipelineStage, Prisma } from '@prisma/client';

import {
  assertPlacesApiAvailable,
  findExistingPlace,
  registerPlacesApiCost,
  searchGooglePlacesNearPoint,
} from '@/lib/places';
import { calculateLeadScore, type ScoreWeights } from '@/lib/scoring';
import { isManagement, type SessionPayload } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { distanceKm } from '@/server/domain/geo';
import { badRequest, forbidden, isAppError } from '@/server/http/errors';
import { DISCOVER_CATEGORIES, type DiscoverCategory } from '@/server/validation/crm';

/** Quantos estabelecimentos o Google devolve por busca (uma chamada = um custo). */
const RESULTS_PER_SEARCH = 20;

const DEFAULT_WEIGHTS: ScoreWeights = {
  categoryWeight: 25,
  compatibilityWeight: 20,
  commercialWeight: 15,
  regionWeight: 15,
  digitalWeight: 10,
  nearbyWeight: 10,
  dataQualityWeight: 5,
};

export interface DiscoveredLead {
  id: string;
  tradeName: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  score: number;
  distance: number;
}

export interface DiscoverResult {
  found: number;
  newLeads: DiscoveredLead[];
  duplicates: number;
  existingCustomers: number;
}

export async function discoverNearby(
  session: SessionPayload,
  params: { lat: number; lng: number; category: DiscoverCategory; radius: number },
): Promise<DiscoverResult> {
  // Vendedor sem cadastro vinculado não tem carteira onde guardar o lead.
  if (!isManagement(session) && !session.sellerId) {
    throw forbidden('Seu usuário não está vinculado a um cadastro de vendedor.');
  }

  await assertPlacesApiAvailable();

  const center = { latitude: params.lat, longitude: params.lng };
  const run = await prisma.prospectingRun.create({
    data: {
      category: params.category,
      query: `Perto de mim (${session.name})`,
      status: 'RUNNING',
    },
  });

  try {
    const search = await searchGooglePlacesNearPoint({
      textQuery: DISCOVER_CATEGORIES[params.category],
      category: params.category,
      latitude: params.lat,
      longitude: params.lng,
      radiusKm: params.radius,
      limit: RESULTS_PER_SEARCH,
    });

    await registerPlacesApiCost({
      costUsd: search.apiCostUsd,
      endpoint: 'Text Search (perto de mim)',
      regionName: null,
      runId: run.id,
    });

    const weights: ScoreWeights = (await prisma.scoreSettings.findFirst()) ?? DEFAULT_WEIGHTS;
    const activeCustomers = (
      await prisma.customer.findMany({
        where: { status: 'ATIVO' },
        select: { latitude: true, longitude: true },
      })
    ).filter(
      (c: { latitude: number | null; longitude: number | null }): c is { latitude: number; longitude: number } =>
        c.latitude !== null && c.longitude !== null,
    );

    // Bairros cadastrados, para ligar o lead ao território pelo nome.
    const neighborhoods = await prisma.neighborhood.findMany({
      where: { active: true },
      select: { id: true, name: true, regionId: true, sellerId: true },
    });
    const byName = new Map(neighborhoods.map((n) => [n.name.trim().toLowerCase(), n]));

    let duplicates = 0;
    let existingCustomers = 0;
    const newLeads: DiscoveredLead[] = [];

    for (const place of search.places) {
      const existing = await findExistingPlace(place);
      if (existing === 'CUSTOMER') {
        existingCustomers++;
        continue;
      }
      if (existing === 'LEAD') {
        duplicates++;
        continue;
      }

      const hood = byName.get(place.neighborhood.trim().toLowerCase()) ?? null;
      // Quem achou no campo fica com o lead; gestão usa o dono do bairro.
      const sellerId = isManagement(session) ? (hood?.sellerId ?? null) : session.sellerId;

      const { score, breakdown } = await calculateLeadScore(
        {
          category: place.category,
          latitude: place.latitude,
          longitude: place.longitude,
          regionId: hood?.regionId ?? null,
          tradeName: place.tradeName,
          phone: place.phone,
          website: place.website,
          googleRating: place.googleRating,
          googleReviewsCount: place.googleReviewsCount,
          hasPhotos: place.hasPhotos,
        },
        weights,
        activeCustomers,
      );

      const lead = await prisma.lead.create({
        data: {
          tradeName: place.tradeName,
          address: place.address,
          neighborhood: place.neighborhood,
          city: place.city,
          state: place.state,
          latitude: place.latitude,
          longitude: place.longitude,
          category: place.category,
          phone: place.phone ?? null,
          googlePlaceId: place.googlePlaceId,
          score,
          scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          sellerId,
          regionId: hood?.regionId ?? null,
          neighborhoodId: hood?.id ?? null,
          pipelineStage: sellerId ? PipelineStage.ATRIBUIDO : PipelineStage.NOVO,
          source: 'CAMPO',
          status: sellerId ? 'ATIVO' : 'SEM_TERRITORIO',
          priority: score >= 80 ? 'ALTA' : score >= 50 ? 'MEDIA' : 'BAIXA',
        },
        select: { id: true },
      });

      newLeads.push({
        id: lead.id,
        tradeName: place.tradeName,
        address: place.address,
        category: place.category,
        latitude: place.latitude,
        longitude: place.longitude,
        score,
        distance: distanceKm(center, place),
      });
    }

    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        resultsFound: search.places.length,
        newLeads: newLeads.length,
        duplicates,
        existingCust: existingCustomers,
        estimatedCost: search.apiCostUsd,
        status: 'SUCCESS',
      },
    });

    newLeads.sort((a, b) => a.distance - b.distance);
    return { found: search.places.length, newLeads, duplicates, existingCustomers };
  } catch (error) {
    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILED',
        errors: error instanceof Error ? error.message : 'Erro desconhecido na busca perto de mim.',
      },
    });
    if (isAppError(error)) throw error;
    // O detalhe técnico fica no histórico de execuções; o vendedor recebe uma frase útil.
    throw badRequest('Não consegui buscar no Google agora. Tente de novo em instantes.');
  }
}
