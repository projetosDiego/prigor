import { NextResponse } from 'next/server';

import { badRequest } from '@/server/http/errors';
import { errorResponse, ok, route } from '@/server/http/respond';
import { verifySiteRequest } from '@/server/integrations/site';
import { receiveSiteOrder } from '@/server/services/site-orders';
import { siteOrderSchema } from '@/server/validation/site-order';

/**
 * Recebe pedidos do site oficial (docesprigor.com.br/natal2026).
 * Autenticado por assinatura HMAC — ver src/server/integrations/site.ts.
 */
export const POST = route('public.site-orders.create', async (request: Request): Promise<NextResponse> => {
  const raw = await request.text();
  const auth = verifySiteRequest(raw, request.headers.get('x-prigor-timestamp'), request.headers.get('x-prigor-signature'));
  if (!auth.ok) return errorResponse(auth.status, auth.status === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE', auth.message);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw badRequest('Corpo da requisição não é um JSON válido.');
  }
  const payload = siteOrderSchema.parse(body);
  const result = await receiveSiteOrder(payload);
  return ok({ ok: true, ...result });
});
