/**
 * Busca por proximidade: leads e clientes ao redor de uma coordenada.
 *
 * Os leads saem escopados pelo vendedor da sessão — carteira alheia não
 * aparece. Os clientes ficam abertos de propósito: a tela usa a rede Prigor
 * instalada como prova social e como referência de rota, e são só nome,
 * categoria e endereço público do estabelecimento.
 */
import { isManagement, requireUser } from '@/server/auth/guard';
import { getNearbyCustomers, getNearbyLeads } from '@/lib/geocoding';
import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { nearbyQuerySchema } from '@/server/validation/crm';

const FALLBACK_RADIUS_KM = 5;

export const GET = route('mapa.proximidade', async (request) => {
  const session = await requireUser();
  const query = parseQuery(request, nearbyQuerySchema);

  let radiusKm: number;
  if (query.radius !== undefined) {
    radiusKm = query.radius;
  } else {
    const settings: { nearbyRadiusKm: number } | null = await prisma.systemSettings.findFirst({
      select: { nearbyRadiusKm: true },
    });
    radiusKm = settings?.nearbyRadiusKm ?? FALLBACK_RADIUS_KM;
  }

  const sellerId = isManagement(session) ? null : (session.sellerId ?? '__sem_vendedor__');

  const [customers, leads] = await Promise.all([
    getNearbyCustomers(query.lat, query.lng, radiusKm),
    getNearbyLeads(query.lat, query.lng, radiusKm, sellerId),
  ]);

  return ok({
    success: true,
    coordinates: { lat: query.lat, lng: query.lng },
    radiusKm,
    customers,
    leads,
  });
});
