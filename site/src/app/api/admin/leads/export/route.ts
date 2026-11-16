import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { leadWhere } from '@/lib/leads/query';
import { LEAD_STATUS_LABEL, type LeadStatus } from '@/lib/leads/schema';

function csvCell(value: unknown): string {
  let s = String(value ?? '');
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (!(await getSession())) return new Response('Não autorizado', { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const leads = await db.lead.findMany({ where: leadWhere(params), orderBy: { createdAt: 'desc' } });

  const header = ['Data', 'Nome', 'Empresa', 'WhatsApp', 'Cidade', 'Bairro', 'Tipo de estabelecimento', 'Instagram', 'Como conheceu', 'Mensagem', 'Origem', 'UTM source', 'UTM medium', 'UTM campaign', 'Status', 'Anotações'];
  const rows = leads.map((l) => [
    l.createdAt.toLocaleString('pt-BR'),
    l.name,
    l.company,
    l.whatsapp,
    l.city,
    l.neighborhood,
    l.businessType,
    l.instagram,
    l.howFound,
    l.message,
    l.source,
    l.utmSource,
    l.utmMedium,
    l.utmCampaign,
    LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status,
    l.notes,
  ]);

  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-doces-prigor-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
