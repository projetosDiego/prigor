import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { route } from '@/server/http/respond';
import { runCollections } from '@/server/services/collections';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get('authorization') ?? '';
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Rotina diária de cobrança, chamada pelo cron da VPS:
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/public/cron/cobranca
 * Sem CRON_SECRET configurado (mín. 16 caracteres) a rota fica desligada.
 */
export const POST = route('cobranca.cron', async (request) => {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: { code: 'DISABLED', message: 'CRON_SECRET não configurado.' } }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }
  return NextResponse.json(await runCollections());
});
