import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { optionalIsoDate, parseQuery, uuid } from '@/server/validation/common';
import { sellerReport } from '@/server/services/reports';
import { renderSellerReportPdf, renderSellersSummaryPdf } from '@/server/services/seller-pdf';

const querySchema = z.object({
  sellerId: uuid('Vendedor').optional(),
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
});

export const GET = route('relatorios.vendedor_pdf', async (request) => {
  await requireManager();
  const { sellerId, from, to } = parseQuery(request, querySchema);

  const report = await sellerReport(from, to);

  // Sem vendedor: relatório geral (todos os vendedores) em um único PDF.
  if (!sellerId) {
    const summary = await renderSellersSummaryPdf(report.rows, report.period);
    return new NextResponse(summary as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="relatorio_vendedores_${report.period.from}_a_${report.period.to}.pdf"`,
        'cache-control': 'no-store',
      },
    });
  }
  const sellerRow = report.rows.find((r) => r.sellerId === sellerId);

  if (!sellerRow) {
    return NextResponse.json({ error: 'Vendedor não encontrado no relatório' }, { status: 404 });
  }

  const pdf = await renderSellerReportPdf(sellerRow, report.period);

  const safeName = sellerRow.sellerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `resumo_comissao_${safeName}_${report.period.from}_a_${report.period.to}.pdf`;

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
