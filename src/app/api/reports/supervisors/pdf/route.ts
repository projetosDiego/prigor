import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { parseQuery, uuid } from '@/server/validation/common';
import { supervisorsReport } from '@/server/services/supervisor-report';
import { renderSupervisorPaymentPdf } from '@/server/services/seller-pdf';

const now = new Date();

const querySchema = z.object({
  supervisorId: uuid('Supervisor'),
  year: z.coerce.number().int().min(2000).max(2100).default(now.getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(now.getUTCMonth() + 1),
});

export const GET = route('relatorios.supervisor_pdf', async (request) => {
  await requireManager();
  const { supervisorId, year, month } = parseQuery(request, querySchema);

  const report = await supervisorsReport(year, month);
  const supervisor = report.supervisors.find((s) => s.supervisorId === supervisorId);
  if (!supervisor) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Supervisor não encontrado neste mês.' }, detail: 'Supervisor não encontrado neste mês.' },
      { status: 404 },
    );
  }

  const pdf = await renderSupervisorPaymentPdf(supervisor, { year, month });
  const safeName = supervisor.supervisorName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `pagamento_supervisor_${safeName}_${year}-${String(month).padStart(2, '0')}.pdf`;

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
