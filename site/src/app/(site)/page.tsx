import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Gift, Search } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { ClosingCta, InstagramSection, OtherProducts, PathButtons, ProductCard, getInstagramPosts, withPhoto } from '@/components/site/blocks';
import { Drip, Lines, Marquee, Seal, Words, vars } from '@/components/site/motion';
import { ProductShowcase } from '@/components/site/ProductShowcase';
import { getActivePoints, getActiveProducts } from '@/lib/catalog';
import { getNatalSettings } from '@/lib/natal/config';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const revalidate = 3600;

const HERO_CUTOUT = '/images/hero-brownie.webp';

/** Fotografias macro da experiência sensorial. Rótulos descrevem só o que a foto mostra. */
const MACROS = {
  recheio: { src: '/images/macro-recheio.webp', alt: 'Camadas de brownie e recheio cremoso vistas de perto', label: 'Recheio' },
  corte: { src: '/images/macro-fatia.webp', alt: 'Fatia de torta de brownie mostrando a massa úmida e o recheio de chocolate', label: 'Corte' },
  chocolate: { src: '/images/macro-mergulho.webp', alt: 'Brownie sendo mergulhado na calda de chocolate', label: 'Chocolate' },
  massa: { src: '/images/macro-casquinha.webp', alt: 'Casquinha craquelada dos brownies Doces Prigor', label: 'Massa' },
  textura: { src: '/images/macro-doce-de-leite.webp', alt: 'Cobertura de doce de leite com crocante sobre o brownie', label: 'Textura' },
  detalhe: { src: '/images/macro-cobertura.webp', alt: 'Brownie com cobertura cremosa e fios de chocolate', label: 'Detalhe' },
} as const;

function Macro({
  item,
  className,
  sizes,
  parallax,
  delay = 0,
}: {
  item: (typeof MACROS)[keyof typeof MACROS];
  className: string;
  sizes: string;
  parallax?: number;
  delay?: number;
}) {
  return (
    <div className={`${className} max-md:!transform-none`} {...(parallax ? { 'data-parallax': '', style: vars({ '--amt': `${parallax}px` }) } : {})}>
      <figure className="frame img-zoom spot relative size-full" data-reveal="curtain" style={vars({ '--reveal-delay': `${delay}ms` })}>
        <Image src={item.src} alt={item.alt} fill sizes={sizes} className="object-cover" />
        <figcaption className="absolute bottom-4 left-4 z-10 rounded-full bg-cocoa/70 px-4 py-2 text-[0.62rem] font-bold tracking-[0.22em] text-cream uppercase backdrop-blur-md">
          {item.label}
        </figcaption>
      </figure>
    </div>
  );
}

export default async function HomePage() {
  const [settings, allProducts, points, natal] = await Promise.all([getSettings(), getActiveProducts(), getActivePoints(), getNatalSettings()]);
  const { content, contact, messages } = settings;
  const posts = await getInstagramPosts(settings);
  const products = withPhoto(allProducts);
  const heroImage = content.heroImage || HERO_CUTOUT;
  const cutout = heroImage === HERO_CUTOUT;
  const cities = new Set(points.map((p) => p.city).filter(Boolean));

  return (
    <>
      {/* ================= PRIMEIRA TELA ================= */}
      <section className="on-dark grain relative isolate overflow-hidden" data-pointer>
        <div className="hero-glow" />
        <div className="hero-cursor" />

        <div className="container-x grid items-center gap-x-10 gap-y-1 pt-1 pb-10 lg:min-h-[min(calc(100svh-11rem),46rem)] lg:grid-cols-[1.08fr_0.92fr] lg:pt-4 lg:pb-8">
          {/* produto */}
          <div className="relative mx-auto w-full max-w-[12.75rem] sm:max-w-sm lg:order-2 lg:max-w-[min(34rem,calc((100svh-15rem)*0.86))]">
            <div className="hero-product relative">
              <div className="hero-in">
                {cutout ? (
                  <div className="relative animate-float">
                    <Image
                      src={heroImage}
                      alt="Brownie recheado Doces Prigor em camadas, com creme, chocolate e morangos frescos"
                      width={1350}
                      height={1500}
                      preload
                      quality={85}
                      sizes="(min-width: 1024px) 560px, (min-width: 640px) 384px, 272px"
                      className="relative z-10 h-auto w-full drop-shadow-[0_40px_50px_rgb(0_0_0_/_0.5)]"
                    />
                  </div>
                ) : (
                  <div className="arch relative aspect-[4/5]">
                    <Image src={heroImage} alt="Brownie Doces Prigor" fill preload quality={85} sizes="(min-width: 1024px) 560px, 384px" className="animate-hero-zoom object-cover" />
                  </div>
                )}
              </div>
              {cutout && <div className="hero-shadow absolute inset-x-[8%] -bottom-[5%] h-[14%]" aria-hidden="true" />}
            </div>
            <div className="hero-seal absolute -top-2 -left-10 z-20 hidden sm:block lg:-top-2 lg:-left-16">
              <Seal size={132} className="hero-in [animation-delay:700ms]" />
            </div>
          </div>

          {/* texto */}
          <div className="lg:py-4">
            <p className="eyebrow animate-fade-up">{content.heroEyebrow}</p>
            <h1 className="display-xl mt-4 lg:mt-5">
              <Words text={content.heroTitle} emphasis={['felicidade']} delay={150} />
            </h1>
            <p className="lead mt-4 max-w-xl animate-fade-up [animation-delay:650ms] lg:mt-6">{content.heroSubtitle}</p>
            <PathButtons where="hero" className="mt-6 max-w-2xl animate-fade-up [animation-delay:800ms] lg:mt-8" />
            {natal.active && (
              <Link
                href="/natal2026"
                className="group mt-4 inline-flex animate-fade-up items-center gap-3 rounded-full border border-gold/45 py-2 pr-4 pl-2 text-[0.8rem] font-bold text-cream transition-colors [animation-delay:950ms] hover:border-gold hover:bg-gold/10"
                data-track="natal_click"
                data-track-label="hero"
              >
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-berry text-cream">
                  <Gift size={15} />
                </span>
                Cardápio de Natal {natal.year} — encomende pelo site
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </div>

        <a
          href="#universo"
          className="absolute bottom-24 left-1/2 hidden 2xl:[@media(min-height:900px)]:inline-flex -translate-x-1/2 items-center gap-3 text-[0.62rem] font-bold tracking-[0.26em] text-cream/55 uppercase transition-colors hover:text-cream"
        >
          Role para descobrir <ArrowDown size={14} className="animate-bounce" />
        </a>

        <Marquee
          className="border-t border-cream/10 py-5 font-display text-xl font-light text-cream/70 italic md:text-2xl"
          items={['A felicidade em forma de brownie', 'Brownies artesanais', 'Brownies recheados', 'Sobremesas', 'Chocolate de verdade']}
        />
      </section>

      {/* ================= A1 · UNIVERSO ================= */}
      <section id="universo" className="relative scroll-mt-20 overflow-hidden pt-16 pb-16 md:pt-24 md:pb-24" aria-labelledby="universo-title">
        <Drip color="#1d0f0b" />
        <div className="container-x grid items-center gap-16 lg:grid-cols-[1fr_0.95fr] lg:gap-24">
          <div>
            <p className="eyebrow" data-reveal>
              Universo Doces Prigor
            </p>
            <h2 id="universo-title" className="display-lg mt-6 text-cocoa" data-reveal>
              {content.universeTitle}
            </h2>
            <p className="lead mt-7 max-w-xl" data-reveal>
              {content.universeText}
            </p>
            <dl className="mt-12 grid gap-px overflow-hidden rounded-[1.5rem] border border-line bg-line sm:grid-cols-3" data-reveal>
              {content.universePillars.map(({ title: term, text }) => (
                <div key={term} className="bg-cream p-6">
                  <dt className="font-display text-2xl text-cocoa italic">{term}</dt>
                  <dd className="mt-2 text-[0.93rem] leading-relaxed text-muted">{text}</dd>
                </div>
              ))}
            </dl>
            <Link href="/nossa-historia" className="link-arrow mt-11 text-cocoa" data-reveal>
              Conheça a nossa história <ArrowRight size={15} />
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-md pb-16 lg:max-w-none lg:pl-10">
            <div className="arch relative aspect-[3/4]" data-reveal="curtain">
              <div className="absolute -inset-y-[8%] inset-x-0" data-parallax="" style={vars({ '--amt': '-34px' })}>
                <Image
                  src="/images/torta-doce-de-leite-cena.webp"
                  alt="Torta de brownie com doce de leite e o selo dourado Doces Prigor"
                  fill
                  sizes="(min-width: 1024px) 40vw, 90vw"
                  className="object-cover"
                />
              </div>
            </div>
            <div className="absolute bottom-0 -left-2 w-[46%] lg:left-0" data-parallax="" style={vars({ '--amt': '46px' })}>
              <div className="frame relative aspect-[4/5] border-[6px] border-cream shadow-[0_40px_60px_-40px_rgb(36_19_15_/_0.6)]" data-reveal="curtain" style={vars({ '--reveal-delay': '250ms' })}>
                <Image src="/images/supremos-dupla.webp" alt="Brownies com cobertura de doce de leite e de chocolate" fill sizes="(min-width: 1024px) 20vw, 42vw" className="object-cover" />
              </div>
            </div>
            <div className="absolute -top-10 -right-2 hidden rounded-full bg-cream p-1.5 sm:block lg:-right-8">
              <Seal size={124} tone="cocoa" />
            </div>
          </div>
        </div>
      </section>

      {/* ================= NATAL ================= */}
      {natal.active && (
        <section className="container-x pb-16 md:pb-24" aria-labelledby="natal-home-title">
          <Link
            href="/natal2026"
            className="group relative isolate grid overflow-hidden rounded-[2rem] bg-[#fbf7f0] md:grid-cols-[1.1fr_0.9fr]"
            data-track="natal_click"
            data-track-label="home-secao"
            data-reveal
          >
            <div className="relative z-10 flex flex-col justify-center p-8 md:p-14">
              <Image src="/images/natal/deco-ramo.webp" alt="" width={310} height={677} className="pointer-events-none absolute -top-8 -left-6 -z-10 w-24 -rotate-12 opacity-70" aria-hidden="true" />
              <p className="eyebrow !text-berry">Natal Prigor {natal.year}</p>
              <h2 id="natal-home-title" className="display-md mt-5 text-cocoa">
                O cardápio de <em className="text-berry">Natal</em> chegou.
              </h2>
              <p className="lead mt-5 max-w-md">Guirlandas de brownie, taças para a ceia, presentes e opções para empresas. Monte o pedido e agende a entrega.</p>
              <span className="btn btn-primary mt-8 self-start">
                Ver cardápio de Natal <ArrowRight size={16} />
              </span>
            </div>
            <div className="img-zoom relative min-h-[18rem] md:min-h-[26rem]">
              <Image src="/images/natal/g-guirlanda-23-1.webp" alt="Guirlanda de brownie com doce de leite, nozes e laço vermelho" fill sizes="(min-width: 768px) 42vw, 92vw" className="object-cover" />
            </div>
          </Link>
        </section>
      )}

      {/* ================= A2 · PRODUTOS ================= */}
      {products.length > 0 && (
        <section className="bg-cream-2 py-16 md:py-24" aria-labelledby="produtos-title">
          <div className="container-x">
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div>
                <p className="eyebrow" data-reveal>
                  Vitrine
                </p>
                <h2 id="produtos-title" className="display-lg mt-6 text-cocoa" data-reveal>
                  {content.productsTitle}
                </h2>
              </div>
              <p className="lead max-w-sm md:text-right" data-reveal>
                {content.productsText}
              </p>
            </div>

            {/* desktop: vitrine interativa */}
            <div className="mt-16 hidden lg:block" data-reveal="fade">
              <ProductShowcase
                products={products.map(({ id, slug, name, category, tagline, description, flavors, image, imageAlt, size }) => ({
                  id,
                  slug,
                  name,
                  category,
                  tagline,
                  description,
                  flavors,
                  image,
                  imageAlt,
                  size,
                }))}
              />
            </div>

            {/* mobile: carrossel */}
            <div className="hide-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10 lg:hidden">
              {products.map((product, i) => (
                <div key={product.id} className="w-[78%] shrink-0 snap-center sm:w-[46%]">
                  <ProductCard product={product} index={i} />
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-center gap-7 lg:mt-20" data-reveal>
              <Link href="/produtos" className="btn btn-outline">
                Ver todos os produtos <ArrowRight size={16} />
              </Link>
              <OtherProducts settings={settings} where="home" compact />
            </div>
          </div>
        </section>
      )}

      {/* ================= A3 · EXPERIÊNCIA SENSORIAL ================= */}
      <section className="on-dark grain relative isolate overflow-hidden bg-cocoa pt-24 pb-28 md:pt-40 md:pb-44" aria-labelledby="sensorial-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_40%_at_15%_12%,rgb(183_122_69_/_0.2),transparent_70%),radial-gradient(45%_35%_at_90%_75%,rgb(183_122_69_/_0.16),transparent_70%)]" />
        <div className="container-x">
          <div className="grid items-end gap-10 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <p className="eyebrow" data-reveal>
                Experiência sensorial
              </p>
              <Lines id="sensorial-title" className="impact mt-7" lines={splitPhrase(content.desireTitle)} />
            </div>
            <p className="lead max-w-sm lg:justify-self-end lg:pb-3" data-reveal>
              {content.desireText}
            </p>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-3 md:mt-24 md:grid-cols-12 md:gap-6">
            <Macro item={MACROS.recheio} className="col-span-2 aspect-[4/5] md:col-span-5 md:aspect-[4/5]" sizes="(min-width: 768px) 40vw, 92vw" />
            <Macro item={MACROS.chocolate} className="aspect-[4/5] md:col-span-4 md:mt-28 md:aspect-square" sizes="(min-width: 768px) 32vw, 46vw" parallax={-36} delay={120} />
            <Macro item={MACROS.massa} className="aspect-[4/5] md:col-span-3 md:mt-10 md:aspect-[3/4]" sizes="(min-width: 768px) 24vw, 46vw" parallax={30} delay={220} />
          </div>

          <Lines
            as="p"
            className="impact mx-auto my-20 max-w-5xl text-center md:my-36"
            lines={splitPhrase(content.sensoryPhrase2, true)}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-6">
            <Macro item={MACROS.textura} className="aspect-[4/5] md:col-span-3 md:mt-16 md:aspect-[3/4]" sizes="(min-width: 768px) 24vw, 46vw" parallax={28} />
            <Macro item={MACROS.detalhe} className="aspect-[4/5] md:col-span-4 md:aspect-square" sizes="(min-width: 768px) 32vw, 46vw" parallax={-30} delay={120} />
            <Macro item={MACROS.corte} className="col-span-2 aspect-[5/4] md:col-span-5 md:mt-24 md:aspect-[5/4]" sizes="(min-width: 768px) 40vw, 92vw" delay={220} />
          </div>

          <div className="mt-20 grid items-end gap-10 md:mt-32 lg:grid-cols-[1.3fr_0.7fr]">
            <Lines as="p" className="display-lg max-w-3xl font-light italic" lines={splitPhrase(content.sensoryPhrase3)} />
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end" data-reveal>
              <Link href="/onde-encontrar" className="btn btn-light" data-track="cta_experimentar" data-track-label="sensorial">
                Quero experimentar <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= A4 · ONDE ENCONTRAR ================= */}
      <section className="relative overflow-hidden pt-16 pb-16 md:pt-24 md:pb-24" aria-labelledby="encontrar-title">
        <Drip />
        <div className="container-x grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <div className="arch relative aspect-[4/5]" data-reveal="curtain">
              <Image
                src="/images/brownies-embalados-laco.webp"
                alt="Brownies Doces Prigor embalados individualmente"
                fill
                sizes="(min-width: 1024px) 34vw, 80vw"
                className="object-cover"
              />
            </div>
            {points.length > 0 && (
              <div className="absolute -right-3 bottom-8 rounded-[1.25rem] bg-cocoa px-6 py-5 text-cream shadow-[0_30px_50px_-30px_rgb(36_19_15_/_0.7)] lg:-right-10" data-reveal>
                <p className="font-display text-5xl leading-none font-light text-gold-2">{points.length}</p>
                <p className="mt-2 text-[0.66rem] font-bold tracking-[0.2em] uppercase">
                  {points.length === 1 ? 'ponto de venda' : 'pontos de venda'}
                  {cities.size > 1 ? ` · ${cities.size} cidades` : ''}
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="eyebrow" data-reveal>
              Onde encontrar
            </p>
            <h2 id="encontrar-title" className="display-lg mt-6 text-cocoa" data-reveal>
              {content.findTitle}
            </h2>
            <p className="lead mt-6 max-w-xl" data-reveal>
              {content.findLead}
            </p>
            <form action="/onde-encontrar" method="get" className="mt-10 flex max-w-xl flex-col gap-3 sm:flex-row" role="search" data-reveal>
              <label htmlFor="home-busca" className="sr-only">
                CEP, bairro ou cidade
              </label>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-bronze" size={19} />
                <input id="home-busca" name="q" type="search" placeholder="CEP, bairro ou cidade" className="field !min-h-[3.6rem] !rounded-full !pl-14" autoComplete="off" />
              </div>
              <button type="submit" className="btn btn-primary !min-h-[3.6rem]" data-track="point_search" data-track-label="home">
                Buscar <ArrowRight size={16} />
              </button>
            </form>
            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm" data-reveal>
              <Link href="/onde-encontrar?perto=1" className="link-underline font-bold text-cocoa" data-track="cta_experimentar" data-track-label="home:localizacao">
                Usar minha localização
              </Link>
              <a
                href={waLink(contact.whatsapp, messages.findPoint)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 font-bold text-[#1f7a4d] hover:underline"
                data-track="whatsapp_click"
                data-track-label="home:onde-encontrar"
              >
                <WhatsAppIcon size={17} /> Consultar disponibilidade no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================= HISTÓRIA ================= */}
      <section className="bg-cream-2 py-16 md:py-24" aria-labelledby="historia-title">
        <div className="container-x grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-24">
          <div>
            <p className="eyebrow" data-reveal>
              Nossa história
            </p>
            <h2 id="historia-title" className="display-lg mt-6 text-cocoa" data-reveal>
              {content.brandTitle}
            </h2>
            <p className="lead mt-7 max-w-xl" data-reveal>
              {content.brandText}
            </p>
            <Link href="/nossa-historia" className="btn btn-primary mt-10" data-reveal>
              Ler a história completa <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative">
            <div className="frame relative aspect-[5/6]" data-reveal="curtain">
              <div className="absolute -inset-y-[8%] inset-x-0" data-parallax="" style={vars({ '--amt': '-30px' })}>
                <Image src="/images/macro-selo.webp" alt="Selo dourado Doces Prigor sobre torta de brownie com doce de leite" fill sizes="(min-width: 1024px) 40vw, 92vw" className="object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= JORNADA B · REVENDA ================= */}
      <section className="on-dark grain relative isolate overflow-hidden bg-cocoa-2 py-16 md:py-24" aria-labelledby="revenda-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(55%_70%_at_100%_0%,rgb(185_154_101_/_0.2),transparent_70%)]" />
        <div className="container-x grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          <div className="relative order-2 lg:order-1">
            <div className="frame relative aspect-[4/5]" data-reveal="curtain">
              <div className="absolute -inset-y-[8%] inset-x-0" data-parallax="" style={vars({ '--amt': '-30px' })}>
                <Image
                  src="/images/expositor-balcao.webp"
                  alt="Expositor de balcão Doces Prigor com brownies embalados individualmente"
                  fill
                  sizes="(min-width: 1024px) 40vw, 92vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="eyebrow" data-reveal>
              Para empresas e revendedores
            </p>
            <h2 id="revenda-title" className="display-lg mt-6" data-reveal>
              {content.resellerTitle}
            </h2>
            <p className="lead mt-7 max-w-xl" data-reveal>
              {content.resellerLead}
            </p>
            <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2" data-reveal>
              {['Produtos com apresentação atrativa', 'Variedade de sabores', 'Prontos para comercialização', 'Atendimento comercial e suporte'].map((item) => (
                <li key={item} className="flex items-center gap-3 border-b border-cream/12 pb-4 text-[0.97rem] text-cream/88">
                  <span className="text-gold" aria-hidden="true">
                    ✦
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-11 flex flex-col gap-3 sm:flex-row" data-reveal>
              <Link href="/seja-um-revendedor" className="btn btn-gold" data-track="cta_vender" data-track-label="home:revenda">
                Quero revender Prigor <ArrowRight size={16} />
              </Link>
              <a href={waLink(contact.whatsapp, messages.reseller)} target="_blank" rel="noopener" className="btn btn-outline-light" data-track="whatsapp_click" data-track-label="home:revenda">
                <WhatsAppIcon size={17} /> Falar com o comercial
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================= A5 · INSTAGRAM ================= */}
      <div className="relative pt-10 md:pt-16">
        <Drip color="var(--color-cocoa-2)" />
        <InstagramSection settings={settings} posts={posts} />
      </div>

      <ClosingCta settings={settings} />
    </>
  );
}

/** Divide uma frase em linhas para a revelação (por sentença; frases longas, ao meio). */
function splitPhrase(text: string, halves = false): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) return sentences;
  if (!halves) return [text];
  const words = text.split(' ');
  if (words.length < 5) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}
