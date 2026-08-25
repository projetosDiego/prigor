import prisma from './db';

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

    // Mapear e calcular distâncias
    return customers
      .map((c) => {
        const distance = calculateHaversineDistance(lat, lng, c.latitude, c.longitude);
        return { ...c, distance };
      })
      .filter((c) => c.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
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
    const filter: any = {
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

    return leads
      .map((l) => {
        const distance = calculateHaversineDistance(lat, lng, l.latitude, l.longitude);
        return { ...l, distance };
      })
      .filter((l) => l.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  } catch (error) {
    console.error('Erro ao buscar leads próximos:', error);
    return [];
  }
}
