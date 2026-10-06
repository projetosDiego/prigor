/** DANFE (PDF) ou XML da nota pelo link do cliente (sem login). */
import { NextResponse } from 'next/server';

import { notFound } from '@/server/http/errors';
import { route } from '@/server/http/respond';
import { publicDocAccess } from '@/server/services/order-docs';
import { invoiceDanfe, invoiceDocument } from '@/server/services/invoices';

type Context = { params: Promise<{ ref: string; invoiceId: string; kind: string }> };

export const GET = route<Context>('public.documentos.nf', async (request, { params }) => {
  const { ref, invoiceId, kind } = await params;
  if (kind !== 'danfe' && kind !== 'xml') throw notFound('Documento');
  const access = publicDocAccess(request, ref);
  const doc =
    kind === 'danfe'
      ? { ...(await invoiceDanfe(access, invoiceId)), contentType: 'application/pdf' }
      : await invoiceDocument(access, invoiceId, 'xml');
  return new NextResponse(doc.data as unknown as BodyInit, {
    headers: {
      'content-type': doc.contentType,
      'content-disposition': `${kind === 'xml' ? 'attachment' : 'inline'}; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
});
