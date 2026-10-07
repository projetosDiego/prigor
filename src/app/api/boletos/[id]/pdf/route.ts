/** PDF do boleto (segunda via no Sicoob). Vendedor só dos próprios pedidos. */
import { NextResponse } from 'next/server';

import { contentDisposition } from '@/lib/filenames';
import { requireUser } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { boletoPdf } from '@/server/services/boletos';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('boletos.pdf', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const { pdf, filename } = await boletoPdf(session, id);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': contentDisposition('inline', filename),
      'cache-control': 'private, no-store',
    },
  });
});
