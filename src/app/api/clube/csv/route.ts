import { NextResponse } from 'next/server';

import { requireManager } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { exportMembersCsv } from '@/server/services/loyalty-admin';

/** Base do Clube (só quem autorizou WhatsApp), para disparos. */
export const GET = route('clube.csv', async () => {
  await requireManager();
  const csv = await exportMembersCsv();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clube-prigor-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
