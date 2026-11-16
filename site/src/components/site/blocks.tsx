import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import type { ProductView } from '@/lib/catalog';
import type { Settings } from '@/lib/settings';
import { instagramHandle } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';
import { InstagramIcon, WhatsAppIcon } from '../icons';
import { Drip, Lines, vars } from './motion';

/* ---------- Títulos ---------- */

export function SectionHeading({
  eyebrow,
  title,
  text,
  align = 'left',
  tone = 'dark',
  as: Tag = 'h2',
  id,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  align?: 'left' | 'center';
  tone?: 'dark' | 'light';
  as?: 'h1' | 'h2';
  id?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'} ${tone === 'light' ? 'on-dark' : ''}`} data-reveal>
      {eyebrow && <p className={`eyebrow ${align === 'center' ? 'eyebrow-plain' : ''}`}>{eyebrow}</p>}
      <Tag id={id} className={`display-md mt-5 ${tone === 'light' ? 'text-cream' : 'text-cocoa'}`}>
        {title}
      </Tag>
      {text && <p className="lead mt-5">{text}</p>}
    </div>
  );
}

/* ---------- Imagem do produto (com fallback de marca) ---------- */

export function ProductImage({
  product,
  sizes,
  className = '',
  preload = false,
}: {
  product: Pick<ProductView, 'image' | 'imageAlt' | 'name'>;
  sizes: string;
  className?: string;
  preload?: boolean;
}) {
  if (!product.image) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center bg-cocoa-2 p-6 ${className}`} role="img" aria-label={`${product.name} — foto em breve`}>
        <Image src="/brand/logo-doces-prigor.png" alt="" width={110} height={97} className="w-[34%] max-w-28 opacity-90" />
      </div>
    );
  }
  return (
    <Image
      src={product.image}
      alt={product.imageAlt || `${product.name} Doces Prigor`}
      fill
      sizes={sizes}
      preload={preload}
      className={`object-cover ${className}`}
    />
  );
}

/** Produtos que entram nas vitrines: só os que já têm fotografia. */
export function withPhoto<T extends { image: string }>(products: T[]): T[] {
  return products.filter((p) => p.image);
}

/* ---------- Card de produto ---------- */

export function ProductCard({ product, index = 0 }: { product: ProductView; index?: number }) {
  return (
    <Link href={`/produtos/${product.slug}`} className="group block" data-reveal style={vars({ '--reveal-delay': `${(index % 3) * 110}ms` })}>
      <div className="arch img-zoom spot relative aspect-[4/5] bg-sand transition-[border-radius] duration-700 ease-[var(--ease-premium)] group-hover:rounded-[1.75rem]">
        <ProductImage product={product} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw" />
        <span className="absolute right-4 bottom-4 z-10 inline-flex size-12 translate-y-3 items-center justify-center rounded-full bg-cream text-cocoa opacity-0 transition-all duration-500 ease-[var(--ease-premium)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <ArrowUpRight size={19} strokeWidth={1.6} />
        </span>
      </div>
      <div className="mt-6">
        <p className="text-[0.66rem] font-bold tracking-[0.22em] text-bronze uppercase">{product.category}</p>
        <h3 className="mt-2 text-[1.75rem] leading-tight font-normal text-cocoa">{product.name}</h3>
        {product.tagline && <p className="mt-2 text-[0.97rem] leading-relaxed text-muted">{product.tagline}</p>}
        {product.flavors.length > 0 && (
          <p className="mt-3 text-[0.8rem] font-semibold tracking-wide text-cocoa-3">{product.flavors.join(' · ')}</p>
        )}
      </div>
    </Link>
  );
}

/* ---------- Outros produtos (consulta pelo WhatsApp) ---------- */

export function OtherProducts({ settings, where, tone = 'light', compact = false }: { settings: Settings; where: string; tone?: 'light' | 'cream'; compact?: boolean }) {
  const href = waLink(settings.contact.whatsapp, settings.messages.catalog);
  if (!href) return null;
  if (compact) {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-[0.97rem] text-muted" data-reveal>
        <span>Temos outros produtos e sabores além destes.</span>
        <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-2 font-bold text-[#1f7a4d] hover:underline" data-track="whatsapp_click" data-track-label={`outros-produtos:${where}`}>
          <WhatsAppIcon size={17} /> Consulte pelo WhatsApp
        </a>
      </p>
    );
  }
  return (
    <div
      className={`flex flex-col items-start justify-between gap-6 rounded-[1.75rem] p-8 md:flex-row md:items-center md:p-12 ${tone === 'cream' ? 'bg-cream-2' : 'border border-line bg-cream'}`}
      data-reveal
    >
      <div>
        <p className="eyebrow eyebrow-plain">Tem mais na Prigor</p>
        <p className="mt-3 font-display text-2xl text-cocoa md:text-3xl">Temos outros produtos e sabores.</p>
        <p className="mt-2 max-w-xl text-muted">Além do que está aqui, a nossa linha muda ao longo do ano. É só consultar pelo WhatsApp.</p>
      </div>
      <a href={href} target="_blank" rel="noopener" className="btn btn-whatsapp shrink-0" data-track="whatsapp_click" data-track-label={`outros-produtos:${where}`}>
        <WhatsAppIcon size={18} /> Consultar no WhatsApp
      </a>
    </div>
  );
}

/* ---------- Os dois caminhos: experimentar / revender ---------- */

export function PathButtons({ where, className = '' }: { where: string; className?: string }) {
  return (
    <div className={`grid gap-2.5 sm:grid-cols-2 sm:gap-3 ${className}`}>
      <Link
        href="/onde-encontrar"
        className="group relative isolate flex min-h-[4.5rem] items-center justify-between gap-4 overflow-hidden rounded-[1.25rem] bg-cream px-6 py-3 sm:min-h-[5.5rem] sm:py-4 text-cocoa transition-transform duration-500 ease-[var(--ease-premium)] hover:-translate-y-1"
        data-track="cta_experimentar"
        data-track-label={where}
      >
        <span className="absolute inset-0 -z-10 translate-y-full bg-gold-2 transition-transform duration-500 ease-[var(--ease-premium)] group-hover:translate-y-0" />
        <span>
          <span className="block text-[0.62rem] font-bold tracking-[0.24em] text-bronze uppercase">Para consumidores</span>
          <span className="mt-1.5 block text-[0.82rem] font-extrabold tracking-[0.14em] uppercase sm:text-[0.86rem]">Quero experimentar</span>
        </span>
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-cocoa text-cream transition-transform duration-500 ease-[var(--ease-premium)] group-hover:translate-x-1">
          <ArrowRight size={17} />
        </span>
      </Link>
      <Link
        href="/seja-um-revendedor"
        className="group relative isolate flex min-h-[4.5rem] items-center justify-between gap-4 overflow-hidden rounded-[1.25rem] bg-gold px-6 py-3 sm:min-h-[5.5rem] sm:py-4 text-cocoa transition-transform duration-500 ease-[var(--ease-premium)] hover:-translate-y-1"
        data-track="cta_vender"
        data-track-label={where}
      >
        <span className="absolute inset-0 -z-10 translate-y-full bg-gold-2 transition-transform duration-500 ease-[var(--ease-premium)] group-hover:translate-y-0" />
        <span>
          <span className="block text-[0.62rem] font-bold tracking-[0.24em] text-cocoa-2 uppercase">Para empresas</span>
          <span className="mt-1.5 block text-[0.82rem] font-extrabold tracking-[0.14em] uppercase sm:text-[0.86rem]">Quero revender Prigor</span>
        </span>
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-cocoa text-cream transition-transform duration-500 ease-[var(--ease-premium)] group-hover:translate-x-1">
          <ArrowRight size={17} />
        </span>
      </Link>
    </div>
  );
}

export function DualPath({ settings, title = 'Qual é o seu próximo passo?' }: { settings: Settings; title?: string }) {
  const { contact, messages } = settings;
  const paths = [
    {
      eyebrow: 'Para consumidores',
      title: 'Quero experimentar',
      text: 'Veja os pontos de venda e encontre a Doces Prigor mais perto de você.',
      image: '/images/brownie-morango.webp',
      alt: 'Brownie Doces Prigor em camadas, com creme e morangos',
      href: '/onde-encontrar',
      cta: 'Onde encontrar',
      track: 'cta_experimentar',
      wa: waLink(contact.whatsapp, messages.findPoint),
      waLabel: 'Perguntar',
    },
    {
      eyebrow: 'Para empresas',
      title: 'Quero revender Prigor',
      text: 'Leve a Doces Prigor para a sua padaria, cafeteria, mercado ou loja.',
      image: '/images/expositor-balcao.webp',
      alt: 'Expositor de balcão Doces Prigor com brownies embalados',
      href: '/seja-um-revendedor',
      cta: 'Seja um revendedor',
      track: 'cta_vender',
      wa: waLink(contact.whatsapp, messages.reseller),
      waLabel: 'WhatsApp',
    },
  ];
  return (
    <section className="container-x py-14 md:py-20" aria-labelledby="dual-path-title">
      <h2 id="dual-path-title" className="sr-only">
        {title}
      </h2>
      <div className="grid gap-5 md:grid-cols-2">
        {paths.map((p, i) => (
          <article
            key={p.href}
            className="frame img-zoom on-dark group relative isolate flex min-h-[30rem] flex-col justify-end p-7 md:min-h-[38rem] md:p-11"
            data-reveal
            style={vars({ '--reveal-delay': `${i * 130}ms` })}
          >
            <Image src={p.image} alt={p.alt} fill sizes="(min-width: 768px) 45vw, 92vw" className="-z-10 object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-cocoa via-cocoa/60 to-cocoa/5" />
            <p className="eyebrow">{p.eyebrow}</p>
            <h3 className="display-md mt-4">{p.title}</h3>
            <p className="mt-3 max-w-sm text-cream/78">{p.text}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={p.href} className={`btn ${i === 0 ? 'btn-light' : 'btn-gold'}`} data-track={p.track} data-track-label="dual-path">
                {p.cta} <ArrowRight size={16} />
              </Link>
              <a href={p.wa} target="_blank" rel="noopener" className="btn btn-outline-light" data-track="whatsapp_click" data-track-label={`dual-path:${p.track}`}>
                <WhatsAppIcon size={17} /> {p.waLabel}
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Instagram ---------- */

export type InstagramPost = { id: string; image: string; href: string; alt: string; remote: boolean };

const CURATED: Omit<InstagramPost, 'href'>[] = [
  { id: 'c1', image: '/images/copo-intenso-colher.webp', alt: 'Copo Intenso com colher', remote: false },
  { id: 'c2', image: '/images/supremos-dupla.webp', alt: 'Brownies com cobertura de doce de leite e de chocolate', remote: false },
  { id: 'c3', image: '/images/pote-dos-sonhos-calda.webp', alt: 'Pote dos Sonhos recebendo calda', remote: false },
  { id: 'c4', image: '/images/torta-doce-de-leite-selo.webp', alt: 'Torta de brownie com o selo Doces Prigor', remote: false },
  { id: 'c5', image: '/images/brownies-embalados-laco.webp', alt: 'Brownies Doces Prigor embalados para presente', remote: false },
  { id: 'c6', image: '/images/classic-mergulho.webp', alt: 'Brownie mergulhado na calda de chocolate', remote: false },
];

/** Posts recentes via Instagram API (token no painel). Sem token, usa fotos oficiais. */
export async function getInstagramPosts(settings: Settings): Promise<InstagramPost[]> {
  const ig = instagramHandle(settings.contact.instagram);
  const profile = `https://www.instagram.com/${ig}/`;
  const token = settings.integrations.instagramToken;
  if (token) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink&limit=12&access_token=${encodeURIComponent(token)}`,
        { next: { revalidate: 3600 } },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string }[];
        };
        const posts = (json.data ?? [])
          .map((p) => ({
            id: p.id,
            image: (p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url) ?? '',
            href: p.permalink,
            alt: (p.caption ?? 'Post da Doces Prigor no Instagram').slice(0, 120),
            remote: true,
          }))
          .filter((p) => p.image)
          .slice(0, 6);
        if (posts.length >= 3) return posts;
      }
    } catch {
      /* cai nas fotos oficiais */
    }
  }
  return CURATED.map((p) => ({ ...p, href: profile }));
}

export function InstagramSection({ settings, posts }: { settings: Settings; posts: InstagramPost[] }) {
  const ig = instagramHandle(settings.contact.instagram);
  if (!ig) return null;
  const live = posts.some((p) => p.remote);
  return (
    <section className="overflow-hidden py-14 md:py-24" aria-labelledby="instagram-title">
      <div className="container-x flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div data-reveal>
          <p className="eyebrow">Instagram</p>
          <h2 id="instagram-title" className="display-lg mt-5 text-cocoa">
            <em className="text-caramel">@</em>
            {ig}
          </h2>
          <p className="lead mt-5 max-w-md">
            {live ? 'As publicações mais recentes da Doces Prigor.' : 'Produtos, novidades e momentos Prigor. Siga e acompanhe de perto.'}
          </p>
        </div>
        <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener" className="btn btn-primary" data-track="instagram_click" data-track-label="secao-instagram" data-reveal>
          <InstagramIcon size={18} /> Seguir @{ig}
        </a>
      </div>
      <div className="container-x mt-12">
        <ul className="hide-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-6 md:gap-4 md:overflow-visible md:px-0">
          {posts.map((post, i) => (
            <li
              key={post.id}
              className={`w-[62%] shrink-0 snap-start sm:w-[40%] md:w-auto ${i % 2 ? 'md:mt-10' : ''}`}
              data-reveal
              style={vars({ '--reveal-delay': `${i * 70}ms` })}
            >
              <a
                href={post.href}
                target="_blank"
                rel="noopener"
                className="img-zoom group relative block aspect-[4/5] overflow-hidden rounded-[1.25rem] bg-sand"
                data-track="instagram_click"
                data-track-label="grid"
              >
                <Image src={post.image} alt={post.alt} fill sizes="(min-width: 768px) 16vw, 62vw" className="object-cover" unoptimized={post.remote} loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center bg-cocoa/55 text-cream opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <InstagramIcon size={30} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Faixa final de conversão ---------- */

export function ClosingCta({ settings }: { settings: Settings }) {
  const { contact, messages } = settings;
  return (
    <section className="on-dark grain relative isolate overflow-hidden bg-cocoa">
      <Image src="/images/macro-casquinha.webp" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-[0.09] blur-[2px]" loading="lazy" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(183_122_69_/_0.22),transparent_70%)]" />
      <div className="container-x py-16 text-center md:py-24">
        <p className="eyebrow eyebrow-plain" data-reveal>
          Doces Prigor
        </p>
        <Lines
          as="p"
          className="impact mx-auto mt-6 max-w-5xl"
          lines={[
            <>A felicidade</>,
            <>
              em forma de <em className="text-gold-grad">brownie.</em>
            </>,
          ]}
        />
        <PathButtons where="closing" className="mx-auto mt-12 max-w-2xl text-left" />
        <a
          href={waLink(contact.whatsapp, messages.general)}
          target="_blank"
          rel="noopener"
          className="mt-8 inline-flex items-center justify-center gap-2 text-sm font-semibold text-cream/75 transition-colors hover:text-cream"
          data-track="whatsapp_click"
          data-track-label="closing"
          data-reveal
        >
          <WhatsAppIcon size={17} /> Falar com a Doces Prigor
        </a>
      </div>
    </section>
  );
}

/* ---------- Cabeçalho de página interna ---------- */

export function PageHero({
  eyebrow,
  title,
  text,
  children,
  image = '/images/macro-casquinha.webp',
  imagePosition = 'center',
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: string;
  children?: React.ReactNode;
  /** Foto de fundo: ocupa o lado direito e se dissolve no chocolate */
  image?: string;
  /** object-position da foto (ex.: "center 30%") */
  imagePosition?: string;
}) {
  return (
    <>
    <section className="page-hero on-dark relative isolate overflow-hidden">
      <div className="page-hero-photo" aria-hidden="true">
        <Image src={image} alt="" fill preload sizes="(min-width: 768px) 62vw, 100vw" className="animate-hero-zoom object-cover" style={{ objectPosition: imagePosition }} />
      </div>
      <div className="page-hero-shade" aria-hidden="true" />
      <div className="container-x relative py-12 md:py-16 lg:py-[4.5rem]">
        <div className="max-w-[40rem]">
          <p className="eyebrow animate-fade-up">{eyebrow}</p>
          <h1 className="display-lg mt-5 animate-fade-up [animation-delay:90ms]">{title}</h1>
          {text && <p className="lead mt-5 max-w-xl animate-fade-up [animation-delay:180ms]">{text}</p>}
          {children && <div className="animate-fade-up [animation-delay:260ms]">{children}</div>}
        </div>
      </div>
      <span className="page-hero-line" aria-hidden="true" />
    </section>
    <div className="h-12 md:h-16" aria-hidden="true" />
    </>
  );
}

/** Seção clara que vem logo depois de uma seção escura: recebe a calda escorrendo. */
export function AfterDark({
  children,
  className = '',
  from = 'var(--color-cocoa)',
  id,
  labelledby,
}: {
  children: React.ReactNode;
  className?: string;
  from?: string;
  id?: string;
  labelledby?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledby} className={`relative ${className}`}>
      <Drip color={from} />
      {children}
    </section>
  );
}
