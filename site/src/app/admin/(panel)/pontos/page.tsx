import type { Metadata } from 'next';
import Link from 'next/link';
import { Eye, EyeOff, MapPin, Pencil, Plus } from 'lucide-react';

import { Badge, PageTitle } from '@/components/admin/fields';
import { db } from '@/lib/db';
import { geocodeMissingPointsAction, togglePointAction } from '../../actions';

export const metadata: Metadata = { title: 'Pontos de venda' };

export default async function AdminPointsPage({ searchParams }: { searchParams: Promise<{ salvo?: string; q?: string; localizados?: string; faltam?: string }> }) {
  const { salvo, q, localizados, faltam } = await searchParams;
  const term = q?.trim();
  const points = await db.pointOfSale.findMany({
    where: term
      ? { OR: [{ name: { contains: term } }, { neighborhood: { contains: term } }, { city: { contains: term } }] }
      : undefined,
    orderBy: [{ active: 'desc' }, { city: 'asc' }, { name: 'asc' }],
  });

  const withoutCoords = points.filter((p) => p.latitude == null || p.longitude == null).length;

  return (
    <>
      <PageTitle title="Pontos de venda" description="Aparecem em Onde Encontrar. Só cadastre estabelecimentos reais e confirmados.">
        <Link href="/admin/pontos/novo" className="btn btn-primary !min-h-10 !px-4 !text-[0.7rem]">
          <Plus size={15} /> Novo ponto
        </Link>
      </PageTitle>

      {localizados !== undefined && (
        <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {localizados} ponto(s) localizado(s) no mapa.{Number(faltam) > 0 ? ` Ainda faltam ${faltam} — clique de novo para continuar.` : ''}
        </p>
      )}
      {withoutCoords > 0 && !term && (
        <form action={geocodeMissingPointsAction} className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            {withoutCoords} ponto(s) sem coordenadas. Eles aparecem na busca, mas não entram na ordenação por distância (“usar minha localização”).
          </p>
          <button className="btn btn-outline !min-h-10 !px-4 !text-[0.66rem]">Localizar no mapa</button>
        </form>
      )}
      {salvo && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Ponto salvo e publicado.</p>}

      <form method="get" className="mb-5 flex gap-2">
        <input name="q" defaultValue={q ?? ''} placeholder="Buscar por nome, bairro ou cidade" className="field !min-h-11 max-w-md" />
        <button className="btn btn-outline !min-h-11 !px-5 !text-[0.7rem]">Buscar</button>
      </form>

      {points.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center">
          <MapPin className="mx-auto text-bronze" size={28} />
          <p className="mt-3 font-semibold text-cocoa">Nenhum ponto de venda cadastrado.</p>
          <p className="mt-1 text-sm text-muted">Enquanto a lista estiver vazia, o site mostra um convite para falar pelo WhatsApp.</p>
          <Link href="/admin/pontos/novo" className="btn btn-primary mt-6 !min-h-10 !px-5 !text-[0.7rem]">Cadastrar o primeiro</Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {points.map((p) => (
            <li key={p.id} className={`flex items-center gap-4 rounded-2xl border border-line bg-white p-4 ${p.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/pontos/${p.id}`} className="font-bold text-cocoa hover:text-bronze">{p.name}</Link>
                  {!p.active && <Badge>Inativo</Badge>}
                  {(p.latitude == null || p.longitude == null) && <Badge tone="amber">Sem coordenadas</Badge>}
                </div>
                <p className="truncate text-sm text-muted">{[p.address, p.neighborhood, p.city].filter(Boolean).join(' · ')}</p>
              </div>
              <form action={togglePointAction}>
                <input type="hidden" name="id" value={p.id} />
                <button className="inline-flex size-10 items-center justify-center rounded-full border border-line text-cocoa hover:bg-[#f4efe8]" aria-label={p.active ? `Desativar ${p.name}` : `Ativar ${p.name}`} title={p.active ? 'Desativar' : 'Ativar'}>
                  {p.active ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </form>
              <Link href={`/admin/pontos/${p.id}`} className="inline-flex size-10 items-center justify-center rounded-full border border-line text-cocoa hover:bg-[#f4efe8]" aria-label={`Editar ${p.name}`}>
                <Pencil size={16} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
