import { prisma } from '@/server/db';

export interface NearbyPlace {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  distance: number;
  score?: number;
}

/**
 * Calcula a distância em km utilizando a fórmula de Haversine diretamente em JavaScript.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Linha de cliente lida pela busca por proximidade (colunas opcionais no schema). */
interface CustomerRow {
  id: string;
  tradeName: string;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Linha de lead lida pela busca por proximidade. */
interface LeadRow {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  score: number;
}

/**
 * Busca Clientes Prigor ativos próximos a uma determinada coordenada.
 */
export async function getNearbyCustomers(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<NearbyPlace[]> {
  try {
    // Buscar clientes ativos no banco
    const customers = await prisma.customer.findMany({
      where: { status: 'ATIVO' },
      select: {
        id: true,
        tradeName: true,
        category: true,
        address: true,
        latitude: true,
        longitude: true,
      },
    });

    // Mapear e calcular distâncias. Cliente sem coordenada não entra na conta:
    // a distância sairia NaN e ele desapareceria silenciosamente no filtro.
    return (customers as CustomerRow[])
      .filter(
        (c): c is CustomerRow & { latitude: number; longitude: number } =>
          c.latitude !== null && c.longitude !== null,
      )
      .map((c) => ({
        id: c.id,
        tradeName: c.tradeName,
        category: c.category ?? '',
        address: c.address ?? '',
        latitude: c.latitude,
        longitude: c.longitude,
        distance: calculateHaversineDistance(lat, lng, c.latitude, c.longitude),
      }))
      .filter((c: NearbyPlace) => c.distance <= radiusKm)
      .sort((a: NearbyPlace, b: NearbyPlace) => a.distance - b.distance);
  } catch (error) {
    console.error('Erro ao buscar clientes próximos:', error);
    return [];
  }
}

/**
 * Busca Leads ativos próximos a uma determinada coordenada, filtrando por vendedor se especificado.
 */
export async function getNearbyLeads(
  lat: number,
  lng: number,
  radiusKm: number,
  sellerId?: string | null
): Promise<NearbyPlace[]> {
  try {
    const filter: Record<string, unknown> = {
      status: 'ATIVO',
      convertedCustomerId: null, // Apenas os que ainda não viraram clientes
    };

    if (sellerId) {
      filter.sellerId = sellerId;
    }

    const leads = await prisma.lead.findMany({
      where: filter,
      select: {
        id: true,
        tradeName: true,
        category: true,
        address: true,
        latitude: true,
        longitude: true,
        score: true,
      },
    });

    return (leads as LeadRow[])
      .map((l) => ({
        ...l,
        distance: calculateHaversineDistance(lat, lng, l.latitude, l.longitude),
      }))
      .filter((l: NearbyPlace) => l.distance <= radiusKm)
      .sort((a: NearbyPlace, b: NearbyPlace) => a.distance - b.distance);
  } catch (error) {
    console.error('Erro ao buscar leads próximos:', error);
    return [];
  }
}
