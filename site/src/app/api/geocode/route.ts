import { NextResponse } from 'next/server';

import { geocode } from '@/lib/geo';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/** Converte bairro/cidade/CEP em coordenadas para ordenar pontos por distância. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 160) ?? '';
  if (q.length < 3) return NextResponse.json({ error: 'Busca muito curta.' }, { status: 400 });
  if (!rateLimit(`geo:${clientIp(request.headers)}`, 20, 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas buscas seguidas.' }, { status: 429 });
  }
  const point = await geocode(q);
  if (!point) return NextResponse.json({ error: 'Local não encontrado.' }, { status: 404 });
  return NextResponse.json(point, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
