import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Badge, PageTitle } from '@/components/admin/fields';
import { db } from '@/lib/db';
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadStatus } from '@/lib/leads/schema';

export const metadata: Metadata = { title: 'Visão geral' };

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Páginas vistas',
  cta_experimentar: 'Cliques em “Quero experimentar”',
  cta_vender: 'Cliques em “Quero vender”',
  whatsapp_click: 'Cliques no WhatsApp',
  instagram_click: 'Cliques no Instagram',
  point_search: 'Buscas por pontos de venda',
  point_geolocation: 'Uso de “minha localização”',
  point_directions: 'Pedidos de rota',
  lead_submit: 'Formulários de revenda enviados',
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = [7, 30, 90].includes(Number(dias)) ? Number(dias) : 30;
  const since = daysAgo(days);

  const [events, sessions, leadsByStatus, leadsInPeriod, recentLeads, productCount, pointCount, topPages, leadSources] = await Promise.all([
    db.event.groupBy({ by: ['type'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.event.findMany({ where: { type: 'page_view', createdAt: { gte: since } }, select: { meta: true } }),
    db.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    db.lead.count({ where: { createdAt: { gte: since } } }),
    db.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    db.product.count({ where: { active: true } }),
    db.pointOfSale.count({ where: { active: true } }),
    db.event.groupBy({ by: ['path'], where: { type: 'page_view', createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { path: 'desc' } }, take: 8 }),
    db.lead.groupBy({ by: ['utmSource'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);

  const count = (type: string) => events.find((e) => e.type === type)?._count._all ?? 0;
  const visits = new Set(
    sessions.map((s) => {
      try {
        return (JSON.parse(s.meta) as { sid?: string }).sid ?? '';
      } catch {
        return '';
      }
    }).filter(Boolean),
  ).size;
  const statusCount = (s: LeadStatus) => leadsByStatus.find((l) => l.status === s)?._count._all ?? 0;

  return (
    <>
      <PageTitle title="Visão geral" description="O que está acontecendo no site.">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin?dias=${d}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${d === days ? 'bg-cocoa text-cream' : 'bg-white text-cocoa'}`}>
            {d} dias
          </Link>
        ))}
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Visitas', visits],
          ['Leads no período', leadsInPeriod],
          ['Produtos ativos', productCount],
          ['Pontos de venda ativos', pointCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">{label}</p>
            <p className="mt-2 font-display text-4xl text-cocoa">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl text-cocoa">Conversão ({days} dias)</h2>
          <ul className="mt-4 divide-y divide-line">
            {Object.entries(EVENT_LABELS).map(([type, label]) => (
              <li key={type} className="flex items-center justify-between py-3 text-sm">
                <span className="text-cocoa-3">{label}</span>
                <span className="font-bold text-cocoa tabular-nums">{count(type)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-cocoa">Funil de revenda</h2>
            <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
              Ver leads <ArrowRight size={14} />
            </Link>
          </div>
          <ul className="mt-4 grid grid-cols-5 gap-2">
            {LEAD_STATUSES.map((s) => (
              <li key={s}>
                <Link href={`/admin/leads?status=${s}`} className="block rounded-xl bg-[#f4efe8] p-3 text-center hover:bg-sand">
                  <span className="block font-display text-2xl text-cocoa">{statusCount(s)}</span>
                  <span className="block text-[0.68rem] font-semibold text-muted">{LEAD_STATUS_LABEL[s]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-7 text-sm font-bold text-cocoa">Últimos leads</h3>
          {recentLeads.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nenhum lead ainda.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {recentLeads.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/leads/${l.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-bronze">
                    <span className="min-w-0 truncate">
                      <strong className="text-cocoa">{l.company}</strong> <span className="text-muted">· {l.city}</span>
                    </span>
                    <Badge tone={l.status === 'NOVO' ? 'dark' : 'neutral'}>{LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl text-cocoa">Páginas mais vistas</h2>
          {topPages.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sem dados no período.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {topPages.map((p) => (
                <li key={p.path} className="flex items-center justify-between py-3 text-sm">
                  <span className="truncate text-cocoa-3">{p.path || '/'}</span>
                  <span className="font-bold text-cocoa tabular-nums">{p._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-xl text-cocoa">Origem dos leads</h2>
          {leadSources.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sem leads no período.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {leadSources.map((s) => (
                <li key={s.utmSource} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-cocoa-3">{s.utmSource || 'Direto / sem UTM'}</span>
                  <span className="font-bold text-cocoa tabular-nums">{s._count._all}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">Use links com ?utm_source=instagram (por exemplo) para saber de onde vêm os cadastros.</p>
        </section>
      </div>
    </>
  );
}
