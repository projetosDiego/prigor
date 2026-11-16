import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';

import { Badge, PageTitle } from '@/components/admin/fields';
import { AutoSubmitSelect } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { leadWhere, type LeadFilters } from '@/lib/leads/query';
import { BUSINESS_TYPES, LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from '@/lib/leads/schema';
import { formatPhone } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';
import { updateLeadAction } from '../../actions';

export const metadata: Metadata = { title: 'Leads' };

const TONE: Record<LeadStatus, 'dark' | 'blue' | 'amber' | 'green' | 'red'> = {
  NOVO: 'dark',
  EM_CONTATO: 'blue',
  NEGOCIACAO: 'amber',
  CONVERTIDO: 'green',
  PERDIDO: 'red',
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<LeadFilters> }) {
  const filters = await searchParams;
  const leads = await db.lead.findMany({ where: leadWhere(filters), orderBy: { createdAt: 'desc' }, take: 500 });
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageTitle title="Leads de revenda" description="Cadastros enviados pelo formulário “Quero vender”.">
        <a href={`/api/admin/leads/export${exportQuery ? `?${exportQuery}` : ''}`} className="btn btn-outline !min-h-10 !px-4 !text-[0.7rem]">
          <Download size={15} /> Exportar CSV
        </a>
      </PageTitle>

      <form className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 2xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" method="get">
        <input name="q" defaultValue={filters.q ?? ''} placeholder="Buscar nome, empresa, cidade, WhatsApp…" className="field !min-h-11" />
        <select name="status" defaultValue={filters.status ?? ''} className="field !min-h-11">
          <option value="">Todos os status</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select name="tipo" defaultValue={filters.tipo ?? ''} className="field !min-h-11">
          <option value="">Todos os tipos</option>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input type="date" name="de" defaultValue={filters.de ?? ''} className="field !min-h-11" aria-label="De" />
        <input type="date" name="ate" defaultValue={filters.ate ?? ''} className="field !min-h-11" aria-label="Até" />
        <div className="flex gap-2">
          <button className="btn btn-primary !min-h-11 flex-1 !px-5 !text-[0.7rem]">Filtrar</button>
          <Link href="/admin/leads" className="btn btn-outline !min-h-11 !px-4 !text-[0.7rem]">Limpar</Link>
        </div>
      </form>

      <p className="mb-3 text-sm text-muted">{leads.length} {leads.length === 1 ? 'lead' : 'leads'}</p>

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center text-muted">Nenhum lead encontrado.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line bg-[#faf7f2] text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Estabelecimento</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Local</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((lead) => (
                <tr key={lead.id} className="align-top hover:bg-[#fcfaf7]">
                  <td className="px-4 py-4 whitespace-nowrap text-muted">
                    {lead.createdAt.toLocaleDateString('pt-BR')}
                    <br />
                    <span className="text-xs">{lead.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/leads/${lead.id}`} className="font-bold text-cocoa hover:text-bronze">
                      {lead.company}
                    </Link>
                    <p className="text-muted">{lead.businessType}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-cocoa">{lead.name}</p>
                    <a href={waLink(lead.whatsapp, `Olá, ${lead.name.split(' ')[0]}! Aqui é da Doces Prigor, recebemos seu cadastro de revenda.`)} target="_blank" rel="noopener" className="text-emerald-700 hover:underline">
                      {formatPhone(lead.whatsapp)}
                    </a>
                  </td>
                  <td className="px-4 py-4 text-cocoa-3">
                    {[lead.neighborhood, lead.city].filter(Boolean).join(', ')}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted">
                    {lead.utmSource || lead.howFound || '—'}
                    {lead.crmSyncedAt && <span className="mt-1 block text-emerald-700">CRM ✓</span>}
                  </td>
                  <td className="px-4 py-4">
                    <form key={lead.status} action={updateLeadAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={lead.id} />
                      <Badge tone={TONE[lead.status as LeadStatus] ?? 'neutral'}>•</Badge>
                      <AutoSubmitSelect name="status" defaultValue={lead.status} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm" aria-label={`Status de ${lead.company}`}>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
