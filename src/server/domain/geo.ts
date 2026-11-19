/**
 * Geografia pura para o "Perto de mim" do vendedor.
 *
 * Sem Prisma, sem HTTP: entra coordenada, sai coordenada. Testável sem banco.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  low: LatLng;
  high: LatLng;
}

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111.32;

/** Distância em km entre dois pontos (Haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Retângulo que contém o círculo de raio `radiusKm` ao redor do centro.
 * É o formato que a Places API (New) aceita em `locationRestriction` do Text Search.
 */
export function boundingBox(center: LatLng, radiusKm: number): BoundingBox {
  if (!(radiusKm > 0)) throw new Error('Raio precisa ser maior que zero.');
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const dLng = radiusKm / (KM_PER_DEGREE_LAT * Math.max(cosLat, 0.000001));
  return {
    low: { latitude: center.latitude - dLat, longitude: center.longitude - dLng },
    high: { latitude: center.latitude + dLat, longitude: center.longitude + dLng },
  };
}

/**
 * Extrai o bairro de um endereço no formato que o Google devolve no Brasil:
 *   "R. Conde de Bonfim, 123 - Tijuca, Rio de Janeiro - RJ, 20520-053, Brasil"
 * O bairro é o trecho entre o primeiro " - " e a vírgula seguinte.
 * Devolve null quando o formato não bate (sem inventar bairro).
 */
export function neighborhoodFromAddress(formattedAddress: string | null | undefined): string | null {
  if (!formattedAddress) return null;
  const firstComma = formattedAddress.indexOf(',');
  // Sem vírgula não há "rua, número - bairro, cidade".
  if (firstComma < 0) return null;
  const secondComma = formattedAddress.indexOf(',', firstComma + 1);
  if (secondComma < 0) return null;
  // Trecho "123 - Loja B - Tijuca": o bairro é o último pedaço depois de " - ".
  const middle = formattedAddress.slice(firstComma + 1, secondComma);
  const parts = middle.split(' - ');
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 1].trim();
  if (!candidate || /^\d/.test(candidate) || candidate.length <= 2) return null;
  return candidate;
}

/**
 * Ordena paradas pela mais próxima a partir de um ponto (vizinho mais próximo).
 * Não é a rota ótima, mas para 5–15 paradas fica perto dela e é previsível.
 */
export function nearestNeighborOrder<T extends LatLng>(start: LatLng, stops: readonly T[]): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current: LatLng = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = next;
  }
  return ordered;
}
