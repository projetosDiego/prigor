/**
 * DANFE da nota. Padrão: DANFE da Prigor, gerado do XML autorizado
 * (logo, canhoto, destaque do total). `?modelo=provedor` devolve o do provedor.
 * Se o gerador próprio falhar, cai no do provedor automaticamente.
 */
import { NextResponse } from 'next/server';

import { contentDisposition } from '@/lib/filenames';
import { requireUser } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { invoiceDanfe } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('notas.danfe', async (request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const provider = new URL(request.url).searchParams.get('modelo') === 'provedor';
  const doc = await invoiceDanfe(session, id, { provider });
  return new NextResponse(doc.data as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': contentDisposition('inline', doc.filename),
      'cache-control': 'private, no-store',
    },
  });
});
