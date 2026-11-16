import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { OtherProducts, ProductCard, ProductImage, withPhoto } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { getActiveProducts, getProductBySlug } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/site';
import { fillTemplate, waLink } from '@/lib/whatsapp';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const products = await getActiveProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Produto não encontrado' };
  const description = [product.tagline, product.description].filter(Boolean).join(' ').slice(0, 158);
  return {
    title: `${product.name}${product.size ? ` ${product.size}` : ''}`,
    description: description || `${product.name} Doces Prigor.`,
    alternates: { canonical: `/produtos/${product.slug}` },
    openGraph: {
      url: `/produtos/${product.slug}`,
      title: `${product.name} | Doces Prigor`,
      images: [product.image || '/og-doces-prigor.jpg'],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, products, settings] = await Promise.all([getProductBySlug(slug), getActiveProducts(), getSettings()]);
  if (!product) notFound();

  const { contact, messages } = settings;
  const related = withPhoto(products.filter((p) => p.id !== product.id)).slice(0, 3);
  const images = [product.image, ...product.gallery].filter(Boolean);

  return (
    <>
      <div className="container-x pt-8 md:pt-12">
        <Link href="/produtos" className="inline-flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.18em] text-muted uppercase transition-colors hover:text-cocoa">
          <ArrowLeft size={16} /> Produtos
        </Link>
      </div>

      <section className="container-x grid gap-10 pt-6 pb-14 md:pb-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
        {/* Galeria */}
        <div className="mx-auto grid w-full max-w-md gap-3 lg:max-w-[min(100%,calc((100svh-11rem)*0.8))]">
          <div className="arch spot relative aspect-[4/5] bg-sand">
            <ProductImage product={product} preload sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {images.slice(1, 5).map((src) => (
                <div key={src} className="frame img-zoom relative aspect-square bg-sand" data-reveal="curtain">
                  <Image src={src} alt={`${product.name} Doces Prigor`} fill sizes="(min-width: 1024px) 27vw, 50vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="lg:sticky lg:top-24 lg:self-start lg:pt-2">
          <p className="eyebrow">{product.category}</p>
          <h1 className="display-lg mt-5 text-cocoa">{product.name}</h1>
          {product.tagline && <p className="mt-5 font-display text-xl font-light text-caramel italic md:text-2xl">{product.tagline}</p>}
          {product.description && <p className="mt-6 text-lg leading-relaxed text-muted">{product.description}</p>}

          <dl className="mt-10 divide-y divide-line border-y border-line">
            {product.size && (
              <div className="flex items-baseline justify-between gap-6 py-5">
                <dt className="text-[0.72rem] font-bold tracking-[0.2em] text-cocoa-3 uppercase">Tamanho</dt>
                <dd className="font-display text-2xl text-cocoa">{product.size}</dd>
              </div>
            )}
            {product.flavors.length > 0 && (
              <div className="py-5">
                <dt className="text-[0.72rem] font-bold tracking-[0.2em] text-cocoa-3 uppercase">Sabores</dt>
                <dd className="mt-4 flex flex-wrap gap-2">
                  {product.flavors.map((f) => (
                    <span key={f} className="rounded-full border border-cocoa/15 bg-cream-2 px-4 py-2 text-[0.92rem] font-semibold text-cocoa">
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {product.extraInfo && (
              <div className="py-5">
                <dt className="text-[0.72rem] font-bold tracking-[0.2em] text-cocoa-3 uppercase">Informações</dt>
                <dd className="mt-3 leading-relaxed whitespace-pre-line text-muted">{product.extraInfo}</dd>
              </div>
            )}
          </dl>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <Link href="/onde-encontrar" className="btn btn-primary" data-track="cta_experimentar" data-track-label={`produto:${product.slug}`}>
              Onde encontrar <ArrowRight size={16} />
            </Link>
            <a
              href={waLink(contact.whatsapp, fillTemplate(messages.product, { produto: product.name }))}
              target="_blank"
              rel="noopener"
              className="btn btn-outline"
              data-track="whatsapp_click"
              data-track-label={`produto:${product.slug}`}
            >
              <WhatsAppIcon size={17} /> Perguntar
            </a>
          </div>

          {product.forResale && (
            <div className="mt-8 rounded-2xl bg-cream-2 p-6">
              <p className="font-semibold text-cocoa">Quer revender {product.name} no seu estabelecimento?</p>
              <Link href="/seja-um-revendedor" className="link-underline mt-2 inline-flex items-center gap-2 text-sm font-bold text-bronze" data-track="cta_vender" data-track-label={`produto:${product.slug}`}>
                Seja um revendedor Doces Prigor <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="border-t border-line bg-cream-2/60 py-14 md:py-20" aria-labelledby="related-title">
          <div className="container-x">
            <h2 id="related-title" className="display-md text-cocoa" data-reveal>
              Você também vai querer
            </h2>
            <div className="mt-10 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
            <div className="mt-16">
              <OtherProducts settings={settings} where="produto" />
            </div>
          </div>
        </section>
      )}

      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Início', path: '/' },
            { name: 'Produtos', path: '/produtos' },
            { name: product.name, path: `/produtos/${product.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description: product.description || product.tagline,
            category: product.category,
            brand: { '@type': 'Brand', name: 'Doces Prigor' },
            url: absoluteUrl(`/produtos/${product.slug}`),
            ...(product.image ? { image: absoluteUrl(product.image) } : {}),
            ...(product.size ? { size: product.size } : {}),
          },
        ]}
      />
    </>
  );
}
