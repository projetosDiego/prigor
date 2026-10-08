/** Relatório por CNPJ (notas, boletos e limite anual). Só gerência. */
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { issuerReport } from '@/server/services/issuer-report';

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).');
const issuerReportQuerySchema = z.object({
  from: date,
  to: date,
  issuerId: z.string().uuid().optional(),
});

export const GET = route('relatorios.empresas', async (request) => {
  await requireManager();
  const q = parseQuery(request, issuerReportQuerySchema);
  return ok(await issuerReport(q));
});
