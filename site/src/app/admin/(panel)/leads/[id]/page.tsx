import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { PageTitle } from '@/components/admin/fields';
import { ConfirmButton, SubmitButton } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from '@/lib/leads/schema';
import { formatPhone, instagramHandle } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';
import { deleteLeadAction, updateLeadAction } from '../../../actions';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) notFound();
  const ig = instagramHandle(lead.instagram);

  const rows: [string, React.ReactNode][] = [
    ['Nome', lead.name],
    ['Empresa', lead.company],
    ['Tipo', lead.businessType],
    ['WhatsApp', formatPhone(lead.whatsapp)],
    ['Cidade', lead.city],
    ['Bairro', lead.neighborhood || '—'],
    ['Instagram', ig ? <a key="ig" href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener" className="text-bronze hover:underline">@{ig}</a> : '—'],
    ['Como conheceu', lead.howFound || '—'],
    ['Origem', [lead.source, lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' · ') || '—'],
    ['Referência', lead.referrer || '—'],
    ['Recebido em', lead.createdAt.toLocaleString('pt-BR')],
    ['CRM', lead.crmSyncedAt ? `Enviado em ${lead.crmSyncedAt.toLocaleString('pt-BR')}` : 'Não enviado'],
  ];

  return (
    <>
      <Link href="/admin/leads" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-cocoa">
        <ArrowLeft size={15} /> Leads
      </Link>
      <PageTitle title={lead.company} description={`${lead.businessType} · ${lead.city}`}>
        <a href={waLink(lead.whatsapp, `Olá, ${lead.name.split(' ')[0]}! Aqui é da Doces Prigor, recebemos seu cadastro de revenda.`)} target="_blank" rel="noopener" className="btn btn-whatsapp !min-h-10 !px-4 !text-[0.7rem]">
          <WhatsAppIcon size={16} /> Chamar no WhatsApp
        </a>
      </PageTitle>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-6">
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-3">
                <dt className="font-semibold text-muted">{k}</dt>
                <dd className="text-cocoa">{v}</dd>
              </div>
            ))}
          </dl>
          {lead.message && (
            <div className="mt-6 rounded-xl bg-[#f4efe8] p-5 text-sm whitespace-pre-line text-cocoa">{lead.message}</div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <form key={`${lead.status}-${lead.updatedAt.getTime()}`} action={updateLeadAction} className="grid gap-5">
            <input type="hidden" name="id" value={lead.id} />
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" defaultValue={lead.status} className="field">
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="notes" className="label">Anotações internas</label>
              <textarea id="notes" name="notes" rows={8} defaultValue={lead.notes} className="field resize-y" placeholder="Histórico de conversas, próximos passos…" />
            </div>
            <SubmitButton>Salvar</SubmitButton>
          </form>
          <form action={deleteLeadAction} className="mt-8 border-t border-line pt-6">
            <input type="hidden" name="id" value={lead.id} />
            <ConfirmButton message="Excluir este lead definitivamente? Use apenas para pedidos de exclusão de dados (LGPD)." className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline">
              <Trash2 size={15} /> Excluir lead
            </ConfirmButton>
          </form>
        </section>
      </div>
    </>
  );
}
