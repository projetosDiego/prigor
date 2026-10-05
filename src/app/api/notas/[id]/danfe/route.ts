/** DANFE da nota (buscado no provedor sob demanda). Vendedor só dos próprios pedidos. */
import { NextResponse } from 'next/server';

import { requireUser } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { invoiceDocument } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('notas.danfe', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const doc = await invoiceDocument(session, id, 'danfe');
  return new NextResponse(doc.data as unknown as BodyInit, {
    headers: {
      'content-type': doc.contentType,
      'content-disposition': `inline; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
});
