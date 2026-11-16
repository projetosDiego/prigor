import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PageHero } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { Lines, Seal, vars } from '@/components/site/motion';
import { getSettings } from '@/lib/settings';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Nossa história',
  description:
    'A Doces Prigor nasceu em 6 de março de 2024, a partir de uma ideia simples: produzir brownies para compartilhar com pessoas próximas. Conheça a nossa história.',
  alternates: { canonical: '/nossa-historia' },
  openGraph: { url: '/nossa-historia', images: ['/images/primeiros-brownies.webp'] },
};

/** Capítulos depois do começo. O texto de cada um vem do painel (Conteúdo → Nossa história). */
const CHAPTERS = [
  { label: 'Os primeiros clientes', image: '/images/brownies-embalados-laco.webp', alt: 'Brownies Doces Prigor embalados individualmente' },
  { label: 'A decisão', image: '/images/expositor-na-mao.webp', alt: 'Expositor Doces Prigor com brownies embalados, nas mãos da equipe' },
  { label: 'Hoje', image: '/images/brownie-recheado-camadas.webp', alt: 'Brownies recheados Doces Prigor empilhados, com recheio aparente' },
];

export default async function StoryPage() {
  const settings = await getSettings();
  const { content } = settings;

  return (
    <>
      <PageHero eyebrow="Nossa história" title={content.aboutTitle} image="/images/macro-casquinha.webp" />

      {/* ---------- O começo ---------- */}
      <section className="pb-16 md:pb-24" aria-labelledby="comeco-title">
        <div className="container-x grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-24">
          <figure className="relative mx-auto w-full max-w-md" data-reveal>
            <div className="rotate-[-2.5deg] rounded-[0.6rem] bg-white p-3 pb-14 shadow-[0_40px_70px_-40px_rgb(36_19_15_/_0.55)] transition-transform duration-700 ease-[var(--ease-premium)] hover:rotate-0">
              <div className="relative aspect-square overflow-hidden rounded-[0.3rem] bg-sand">
                <Image
                  src="/images/primeiros-brownies.webp"
                  alt="Os primeiros brownies da Doces Prigor, embalados um a um"
                  fill
                  sizes="(min-width: 1024px) 34vw, 88vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="absolute inset-x-0 bottom-4 text-center font-display text-lg text-cocoa-3 italic">
                Os nossos primeiros brownies
              </figcaption>
            </div>
          </figure>
          <div>
            <p className="eyebrow" data-reveal>
              O começo
            </p>
            <p id="comeco-title" className="mt-6 font-display text-[clamp(3.2rem,8vw,6.5rem)] leading-none font-light tracking-[-0.04em] text-caramel" data-reveal>
              06.03.2024
            </p>
            <p className="mt-8 font-display text-[1.6rem] leading-[1.35] font-light tracking-[-0.015em] text-cocoa md:text-[2.1rem]" data-reveal>
              {content.aboutLead}
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Capítulos ---------- */}
      <section className="bg-cream-2 py-16 md:py-24">
        <div className="container-x">
          <ol className="grid gap-24 md:gap-36">
            {content.aboutParagraphs.map((paragraph, i) => {
              const chapter = CHAPTERS[i % CHAPTERS.length]!;
              const flip = i % 2 === 0;
              return (
                <li key={i} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
                  <div className={`relative mx-auto w-full max-w-md ${flip ? 'lg:order-2' : ''}`}>
                    <div className={`${i % 2 === 0 ? 'arch' : 'frame'} relative aspect-[4/5]`} data-reveal="curtain">
                      <div className="absolute -inset-y-[8%] inset-x-0" data-parallax="" style={vars({ '--amt': '-30px' })}>
                        <Image src={chapter.image} alt={chapter.alt} fill sizes="(min-width: 1024px) 36vw, 90vw" className="object-cover" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="flex items-baseline gap-5" data-reveal>
                      <span className="font-display text-7xl leading-none font-light text-caramel/70 italic md:text-8xl">{String(i + 2).padStart(2, '0')}</span>
                      <span className="eyebrow eyebrow-plain">{i < CHAPTERS.length ? chapter.label : 'Doces Prigor'}</span>
                    </p>
                    <p className="mt-8 font-display text-[1.5rem] leading-[1.38] font-light tracking-[-0.015em] text-cocoa md:text-[1.95rem]" data-reveal>
                      {paragraph}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---------- Próximo capítulo ---------- */}
      <section className="on-dark grain relative isolate overflow-hidden bg-cocoa-2 py-16 md:py-24" aria-labelledby="proximo-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(55%_70%_at_100%_0%,rgb(185_154_101_/_0.2),transparent_70%)]" />
        <div className="container-x grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-24">
          <div>
            <p className="eyebrow" data-reveal>
              Daqui para frente
            </p>
            <h2 id="proximo-title" className="display-lg mt-6" data-reveal>
              {content.storyNextTitle}
            </h2>
            <p className="lead mt-7 max-w-2xl" data-reveal>
              {content.storyNextText}
            </p>
            <p className="mt-14 text-[1.05rem] text-cream/75" data-reveal>
              {content.storyClosing}
            </p>
            <Lines
              as="p"
              className="impact mt-5 max-w-4xl"
              lines={[
                <>Doces Prigor —</>,
                <>
                  a felicidade em forma de <em className="text-gold-grad">brownie.</em>
                </>,
              ]}
            />
            <div className="mt-12 flex flex-col gap-3 sm:flex-row" data-reveal>
              <Link href="/produtos" className="btn btn-light">
                Conheça os produtos <ArrowRight size={16} />
              </Link>
              <Link href="/seja-um-revendedor" className="btn btn-outline-light" data-track="cta_vender" data-track-label="historia">
                Faça parte da rede
              </Link>
            </div>
          </div>
          <Seal size={220} className="mx-auto hidden lg:block" />
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Início', path: '/' },
          { name: 'Nossa história', path: '/nossa-historia' },
        ])}
      />
    </>
  );
}
