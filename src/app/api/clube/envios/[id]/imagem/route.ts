import { NextResponse } from 'next/server';

import { requireManager } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { getSubmissionImage } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('clube.envios.imagem', async (_request, { params }) => {
  await requireManager();
  const id = uuid('Envio').parse((await params).id);
  const { data, mime } = await getSubmissionImage(id);
  return new NextResponse(Buffer.from(data), {
    status: 200,
    headers: { 'content-type': mime, 'cache-control': 'private, max-age=3600' },
  });
});
