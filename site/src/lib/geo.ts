export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

export function fullAddress(p: { address: string; neighborhood: string; city: string; state: string; zipCode?: string }): string {
  return [p.address, p.neighborhood, [p.city, p.state].filter(Boolean).join(' - '), p.zipCode]
    .filter((v) => v && v.trim())
    .join(', ');
}

export function directionsUrl(p: { latitude: number | null; longitude: number | null; address: string; neighborhood: string; city: string; state: string; name: string }): string {
  const destination =
    p.latitude != null && p.longitude != null
      ? `${p.latitude},${p.longitude}`
      : `${p.name}, ${fullAddress(p)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function mapEmbedUrl(p: { latitude: number | null; longitude: number | null; address: string; neighborhood: string; city: string; state: string; name: string }): string {
  const q =
    p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : `${p.name}, ${fullAddress(p)}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`;
}

/**
 * Geocodificação via OpenStreetMap Nominatim (gratuito, sem chave).
 * Política de uso: 1 req/s e User-Agent identificável — só chamamos a partir
 * do servidor, com cache.
 */
export async function geocode(query: string): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DocesPrigorSite/1.0 (site oficial)', 'Accept-Language': 'pt-BR' },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data[0]) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch {
    return null;
  }
}
