import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const ALLOWED = [
  'page_view',
  'whatsapp_click',
  'cta_experimentar',
  'cta_vender',
  'instagram_click',
  'point_search',
  'point_geolocation',
  'point_directions',
  'lead_submit',
] as const;

const schema = z.object({
  type: z.enum(ALLOWED),
  label: z.string().max(160).default(''),
  path: z.string().max(300).default(''),
  sid: z.string().max(64).default(''),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Registro próprio de eventos de conversão (alimenta o painel). */
export async function POST(request: Request) {
  if (!rateLimit(`ev:${clientIp(request.headers)}`, 120, 60 * 1000)) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 204 });
    const { type, label, path, sid } = parsed.data;
    if (path.startsWith('/admin')) return new NextResponse(null, { status: 204 });
    await db.event.create({ data: { type, label, path, meta: JSON.stringify({ sid }) } });
  } catch {
    /* nunca falha para o visitante */
  }
  return new NextResponse(null, { status: 204 });
}
