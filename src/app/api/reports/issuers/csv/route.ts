/** Relatório por CNPJ em planilha (CSV para Excel). Só gerência. */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { issuerReport, issuerReportCsv } from '@/server/services/issuer-report';

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).');
const querySchema = z.object({ from: date, to: date, issuerId: z.string().uuid().optional() });

export const GET = route('relatorios.empresas.csv', async (request) => {
  await requireManager();
  const q = parseQuery(request, querySchema);
  const csv = issuerReportCsv(await issuerReport(q));
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="Faturamento por CNPJ ${q.from} a ${q.to}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
});
