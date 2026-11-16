import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { DualPath, OtherProducts, PageHero, ProductCard, withPhoto } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { getActiveProducts } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { slugify } from '@/lib/text';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Produtos — brownie recheado, potes e doces',
  description:
    'Conheça os produtos Doces Prigor: Brownie Recheado, Dip Brownie, Brownie Supremo, Pote dos Sonhos, Copo Intenso e Brigadeiro Prigor.',
  alternates: { canonical: '/produtos' },
  openGraph: { url: '/produtos', images: ['/images/brownie-recheado-camadas.webp'] },
};

export default async function ProductsPage() {
  const [allProducts, settings] = await Promise.all([getActiveProducts(), getSettings()]);
  const products = withPhoto(allProducts);

  const categories = Array.from(new Set(products.map((p) => p.category || 'Outros')));
  const grouped = categories.map((category) => ({
    category,
    id: slugify(category),
    items: products.filter((p) => (p.category || 'Outros') === category),
  }));

  return (
    <>
      <PageHero
        eyebrow="Produtos"
        title={
          <>
            Escolha pelo olho. Confirme na <em className="text-gold-grad">primeira mordida.</em>
          </>
        }
        text="Brownies, sobremesas de colher e doces com a assinatura Doces Prigor."
        image="/images/macro-cobertura.webp"
      >
        {categories.length > 1 && (
          <nav aria-label="Categorias" className="mt-8 flex flex-wrap gap-2">
            {grouped.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="rounded-full border border-cream/25 px-5 py-2.5 text-[0.7rem] font-bold tracking-[0.14em] text-cream uppercase transition-colors duration-300 hover:border-gold hover:text-gold-2">
                {g.category}
              </a>
            ))}
          </nav>
        )}
      </PageHero>

      {products.length === 0 ? (
        <p className="container-x pb-16 text-muted">Nenhum produto disponível no momento.</p>
      ) : (
        grouped.map((group) => (
          <section
            key={group.id}
            id={group.id}
            className="container-x scroll-mt-28 pb-14 md:pb-20"
            aria-labelledby={`${group.id}-title`}
          >
            <div className="mb-12 flex items-baseline justify-between border-b border-cocoa/15 pb-6" data-reveal>
              <h2 id={`${group.id}-title`} className="display-md text-cocoa italic">
                {group.category}
              </h2>
              <span className="text-sm text-muted">
                {group.items.length} {group.items.length === 1 ? 'produto' : 'produtos'}
              </span>
            </div>
            <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          </section>
        ))
      )}

      <section className="container-x pb-5">
        <OtherProducts settings={settings} where="produtos" tone="cream" />
      </section>

      <section className="container-x pb-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[1.75rem] border border-line p-8 md:flex-row md:items-center md:p-12" data-reveal>
          <div>
            <p className="font-display text-2xl text-cocoa md:text-3xl">Tem um estabelecimento?</p>
            <p className="mt-2 text-muted">Estes produtos podem estar no seu balcão.</p>
          </div>
          <Link href="/seja-um-revendedor" className="btn btn-primary" data-track="cta_vender" data-track-label="produtos">
            Quero revender Prigor <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <DualPath settings={settings} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Início', path: '/' },
          { name: 'Produtos', path: '/produtos' },
        ])}
      />
    </>
  );
}
