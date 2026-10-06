/** PDF do boleto pelo link do cliente (sem login). */
import { NextResponse } from 'next/server';

import { route } from '@/server/http/respond';
import { publicDocAccess } from '@/server/services/order-docs';
import { boletoPdf } from '@/server/services/boletos';

type Context = { params: Promise<{ ref: string; boletoId: string }> };

export const GET = route<Context>('public.documentos.boleto', async (request, { params }) => {
  const { ref, boletoId } = await params;
  const { pdf, filename } = await boletoPdf(publicDocAccess(request, ref), boletoId);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
});
