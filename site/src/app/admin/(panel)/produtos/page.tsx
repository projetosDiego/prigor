import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react';

import { Badge, PageTitle } from '@/components/admin/fields';
import { db } from '@/lib/db';
import { parseList } from '@/lib/text';
import { toggleProductAction } from '../../actions';

export const metadata: Metadata = { title: 'Produtos' };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const { salvo } = await searchParams;
  const products = await db.product.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });

  return (
    <>
      <PageTitle title="Produtos" description="O que aparece em Produtos, na Home e na página Quero Vender.">
        <Link href="/admin/produtos/novo" className="btn btn-primary !min-h-10 !px-4 !text-[0.7rem]">
          <Plus size={15} /> Novo produto
        </Link>
      </PageTitle>

      {salvo && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Produto salvo e publicado.</p>}

      <ul className="grid gap-3">
        {products.map((p) => (
          <li key={p.id} className={`flex items-center gap-4 rounded-2xl border border-line bg-white p-3 pr-4 ${p.active ? '' : 'opacity-60'}`}>
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-sand">
              {p.image && <Image src={p.image} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/produtos/${p.id}`} className="font-bold text-cocoa hover:text-bronze">{p.name}</Link>
                {!p.active && <Badge>Inativo</Badge>}
                {p.featured && <Badge tone="amber">Destaque</Badge>}
                {!p.image && <Badge tone="red">Sem foto</Badge>}
              </div>
              <p className="truncate text-sm text-muted">
                {[p.category, p.size, parseList(p.flavors).join(', ')].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <span className="hidden text-xs text-muted md:block">Ordem {p.order}</span>
            <form action={toggleProductAction}>
              <input type="hidden" name="id" value={p.id} />
              <button className="inline-flex size-10 items-center justify-center rounded-full border border-line text-cocoa hover:bg-[#f4efe8]" title={p.active ? 'Desativar' : 'Ativar'} aria-label={p.active ? `Desativar ${p.name}` : `Ativar ${p.name}`}>
                {p.active ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
            </form>
            <Link href={`/admin/produtos/${p.id}`} className="inline-flex size-10 items-center justify-center rounded-full border border-line text-cocoa hover:bg-[#f4efe8]" aria-label={`Editar ${p.name}`}>
              <Pencil size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
