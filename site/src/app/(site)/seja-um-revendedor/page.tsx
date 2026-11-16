import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Check, Coffee, Croissant, Gem, HeartHandshake, Layers, PackageCheck, Repeat, ShoppingBasket, ShoppingCart, Sparkles, Store, UtensilsCrossed, Headset } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { ProductImage, withPhoto } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { Drip, Lines, vars } from '@/components/site/motion';
import { ResellerForm } from '@/components/site/ResellerForm';
import { getActiveProducts } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Seja um revendedor Doces Prigor',
  description:
    'Leve os brownies Doces Prigor para a sua padaria, cafeteria, mercado, restaurante ou loja. Conheça a parceria e envie seu cadastro de revenda.',
  alternates: { canonical: '/seja-um-revendedor' },
  openGraph: { url: '/seja-um-revendedor', images: ['/images/expositor-balcao.webp'] },
};

/** B2 — sem promessa de margem, faturamento ou resultado. */
const REASONS = [
  { icon: Sparkles, title: 'Apresentação atrativa', text: 'Produtos que chamam atenção no balcão e despertam vontade antes da primeira mordida.' },
  { icon: Layers, title: 'Variedade de sabores', text: 'Brownies recheados em vários sabores e uma linha de sobremesas para compor o seu mix.' },
  { icon: PackageCheck, title: 'Prontos para comercialização', text: 'Produtos embalados e identificados com a marca, prontos para expor e vender.' },
  { icon: Headset, title: 'Atendimento comercial', text: 'Contato direto com a nossa equipe, do primeiro pedido em diante.' },
  { icon: Repeat, title: 'Parceria recorrente', text: 'Uma relação pensada para durar, com reposição combinada com o seu estabelecimento.' },
  { icon: HeartHandshake, title: 'Suporte da equipe', text: 'Estamos por perto para ajudar o produto a funcionar bem no seu ponto de venda.' },
];

/** B3 — perfil dos parceiros. */
const PROFILES = [
  { icon: Croissant, label: 'Padarias' },
  { icon: Coffee, label: 'Cafeterias' },
  { icon: ShoppingCart, label: 'Mercados' },
  { icon: UtensilsCrossed, label: 'Restaurantes' },
  { icon: Store, label: 'Lojas de conveniência' },
  { icon: ShoppingBasket, label: 'Empórios' },
  { icon: Gem, label: 'Outros estabelecimentos comerciais' },
];

export default async function ResellerPage() {
  const [settings, products] = await Promise.all([getSettings(), getActiveProducts()]);
  const { content, contact, messages } = settings;
  const resale = withPhoto(products.filter((p) => p.forResale));
  const wa = waLink(contact.whatsapp, messages.reseller);

  return (
    <>
      {/* ============ B1 · Apresentação comercial ============ */}
      <section className="on-dark grain relative isolate overflow-hidden bg-cocoa">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_85%_30%,rgb(185_154_101_/_0.26),transparent_70%)]" />
        <div className="container-x grid items-center gap-12 pt-10 pb-16 md:pt-16 md:pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div>
            <p className="eyebrow animate-fade-up">Para empresas e revendedores</p>
            <h1 className="display-xl mt-6 animate-fade-up [animation-delay:90ms] lg:!text-[clamp(3rem,6vw,5.6rem)]">{content.resellerTitle}</h1>
            <p className="lead mt-7 max-w-xl animate-fade-up [animation-delay:180ms]">{content.resellerLead}</p>
            <div className="mt-10 flex animate-fade-up flex-col gap-3 [animation-delay:260ms] sm:flex-row">
              <a href="#cadastro" className="btn btn-gold" data-track="cta_vender" data-track-label="hero-b2b">
                Quero ser um revendedor <ArrowDown size={16} />
              </a>
              <a href={wa} target="_blank" rel="noopener" className="btn btn-outline-light" data-track="whatsapp_click" data-track-label="hero-b2b">
                <WhatsAppIcon size={18} /> Falar com o comercial
              </a>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="arch relative aspect-[4/5] animate-fade-up [animation-delay:200ms]">
              <Image
                src="/images/expositor-balcao.webp"
                alt="Expositor de balcão Doces Prigor com brownies embalados individualmente"
                fill
                preload
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="animate-hero-zoom object-cover"
              />
            </div>
            <div className="frame absolute -bottom-8 -left-3 hidden aspect-[4/5] w-[38%] border-[6px] border-cocoa sm:block lg:-left-12" data-parallax="" style={vars({ '--amt': '30px' })}>
              <Image src="/images/expositor-brownies.webp" alt="Brownies Doces Prigor embalados no expositor da marca" fill sizes="(min-width: 1024px) 16vw, 30vw" className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* ============ B2 · Por que revender ============ */}
      <section className="relative pt-16 pb-16 md:pt-24 md:pb-24" aria-labelledby="porque-title">
        <Drip />
        <div className="container-x">
          <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="eyebrow" data-reveal>
                A parceria
              </p>
              <h2 id="porque-title" className="display-lg mt-6 text-cocoa" data-reveal>
                Por que revender Doces Prigor?
              </h2>
            </div>
            <p className="lead lg:justify-self-end lg:text-right" data-reveal>
              Uma marca que chega ao seu estabelecimento com produto, identidade e gente por trás.
            </p>
          </div>
          <ul className="mt-16 grid gap-px overflow-hidden rounded-[1.75rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {REASONS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="group bg-cream p-8 transition-colors duration-500 hover:bg-cocoa md:p-10" data-reveal="fade" style={vars({ '--reveal-delay': `${(i % 3) * 90}ms` })}>
                <span className="inline-flex size-14 items-center justify-center rounded-full border border-caramel/40 text-caramel transition-colors duration-500 group-hover:border-gold group-hover:text-gold">
                  <Icon size={24} strokeWidth={1.4} />
                </span>
                <h3 className="mt-8 text-[1.6rem] leading-tight text-cocoa transition-colors duration-500 group-hover:text-cream">{title}</h3>
                <p className="mt-3 leading-relaxed text-muted transition-colors duration-500 group-hover:text-cream/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Produtos para revenda */}
      {resale.length > 0 && (
        <section className="bg-cream-2 py-16 md:py-24" aria-labelledby="revenda-produtos">
          <div className="container-x">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div data-reveal>
                <p className="eyebrow">Produtos</p>
                <h2 id="revenda-produtos" className="display-md mt-5 text-cocoa">
                  O que pode estar no seu balcão.
                </h2>
              </div>
              <Link href="/produtos" className="link-arrow text-cocoa" data-reveal>
                Ver detalhes dos produtos <ArrowRight size={15} />
              </Link>
            </div>
            <ul className="hide-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-6">
              {resale.map((p, i) => (
                <li key={p.id} className="w-[58%] shrink-0 snap-start md:w-auto" data-reveal style={vars({ '--reveal-delay': `${(i % 6) * 70}ms` })}>
                  <Link href={`/produtos/${p.slug}`} className="group block">
                    <div className="arch img-zoom relative aspect-[3/4] bg-sand">
                      <ProductImage product={p} sizes="(min-width: 1024px) 15vw, (min-width: 768px) 30vw, 58vw" />
                    </div>
                    <p className="mt-4 font-display text-xl text-cocoa">{p.name}</p>
                    {p.flavors.length > 0 && <p className="mt-1 text-[0.8rem] text-muted">{p.flavors.length} sabores</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ============ B3 · Perfil dos parceiros ============ */}
      <section className="py-16 md:py-24" aria-labelledby="perfil-title">
        <div className="container-x grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <p className="eyebrow" data-reveal>
              Perfil dos parceiros
            </p>
            <h2 id="perfil-title" className="display-lg mt-6 text-cocoa" data-reveal>
              Onde a Prigor <em className="text-caramel">combina.</em>
            </h2>
            <p className="lead mt-6 max-w-md" data-reveal>
              Se o seu estabelecimento recebe gente que gosta de um bom doce, ele pode ser um ponto Doces Prigor.
            </p>
          </div>
          <ul className="border-t border-cocoa/12">
            {PROFILES.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className="group flex items-center gap-6 border-b border-cocoa/12 py-6 transition-[padding] duration-500 ease-[var(--ease-premium)] hover:pl-4 md:py-7"
                data-reveal
                style={vars({ '--reveal-delay': `${i * 60}ms` })}
              >
                <span className="w-8 text-[0.68rem] font-bold tracking-[0.18em] text-caramel">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-display text-[1.7rem] leading-tight font-light tracking-[-0.02em] text-cocoa md:text-[2.4rem]">{label}</span>
                <Icon size={28} strokeWidth={1.2} className="ml-auto shrink-0 text-cocoa/30 transition-colors duration-500 group-hover:text-caramel" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Como funciona */}
      {content.resellerSteps.length > 0 && (
        <section className="bg-cream-2 py-16 md:py-24" aria-labelledby="como-title">
          <div className="container-x">
            <p className="eyebrow" data-reveal>
              Como funciona
            </p>
            <h2 id="como-title" className="display-md mt-5 text-cocoa" data-reveal>
              Do cadastro ao balcão, sem complicação.
            </h2>
            <ol className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {content.resellerSteps.map((step, i) => (
                <li key={step.title} className="relative border-t border-cocoa/20 pt-7" data-reveal style={vars({ '--reveal-delay': `${i * 100}ms` })}>
                  <span className="absolute -top-px left-0 h-px w-14 bg-caramel" aria-hidden="true" />
                  <span className="font-display text-6xl leading-none font-light text-caramel italic">{i + 1}</span>
                  <h3 className="mt-6 text-2xl text-cocoa">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
            {content.resellerConditions && (
              <div className="mt-14 rounded-[1.5rem] border border-line bg-cream p-7 whitespace-pre-line text-cocoa md:p-10" data-reveal>
                <p className="eyebrow eyebrow-plain mb-4">Condições comerciais</p>
                {content.resellerConditions}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============ B4 · Quero ser um revendedor ============ */}
      <section id="cadastro" className="on-dark grain relative isolate scroll-mt-20 overflow-hidden bg-cocoa py-16 md:py-24" aria-labelledby="cadastro-title">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_0%_0%,rgb(183_122_69_/_0.25),transparent_70%)]" />
        <div className="container-x grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow" data-reveal>
              Cadastro de revenda
            </p>
            <h2 id="cadastro-title" className="display-lg mt-6" data-reveal>
              Quero ser um revendedor.
            </h2>
            <p className="lead mt-6" data-reveal>
              Conte sobre o seu estabelecimento. Nossa equipe comercial recebe o cadastro e continua a conversa pelo WhatsApp.
            </p>
            <ul className="mt-9 space-y-4" data-reveal>
              {['Leva menos de dois minutos', 'Sem compromisso', 'Resposta da equipe comercial pelo WhatsApp'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-cream/85">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gold text-cocoa">
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-11 rounded-[1.5rem] border border-cream/15 p-7" data-reveal>
              <p className="font-display text-2xl">Prefere conversar direto?</p>
              <p className="mt-2 text-cream/70">O WhatsApp já abre com a mensagem pronta.</p>
              <a href={wa} target="_blank" rel="noopener" className="btn btn-whatsapp mt-6 w-full sm:w-auto" data-track="whatsapp_click" data-track-label="cadastro:revenda">
                <WhatsAppIcon size={18} /> Chamar no WhatsApp
              </a>
            </div>
          </div>
          <div data-reveal>
            <ResellerForm whatsapp={contact.whatsapp} followUpTemplate={messages.leadFollowUp} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      {content.resellerFaq.length > 0 && (
        <section className="relative pt-16 pb-16 md:pt-24 md:pb-24" aria-labelledby="faq-title">
          <Drip />
          <div className="container-x grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div data-reveal>
              <p className="eyebrow">Perguntas frequentes</p>
              <h2 id="faq-title" className="display-md mt-5 text-cocoa">
                Antes de começar.
              </h2>
            </div>
            <div className="border-t border-cocoa/12">
              {content.resellerFaq.map((item) => (
                <details key={item.question} className="group border-b border-cocoa/12 py-7">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-[1.45rem] leading-snug text-cocoa [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-cocoa/20 text-xl font-light text-caramel transition-transform duration-500 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl leading-relaxed text-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ B5 · Chamada final ============ */}
      <section className="on-dark grain relative isolate overflow-hidden bg-cocoa-2">
        <Image src="/images/expositor-na-mao.webp" alt="" fill sizes="100vw" className="-z-10 object-cover object-[50%_35%] opacity-25" loading="lazy" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-cocoa-2 via-cocoa-2/85 to-cocoa-2/40" />
        <div className="container-x py-16 md:py-40">
          <Lines
            className="impact max-w-4xl"
            lines={[
              <>Vamos crescer</>,
              <>
                <em className="text-gold-grad">juntos?</em>
              </>,
            ]}
          />
          <p className="mt-8 font-display text-2xl font-light text-cream/85 md:text-3xl" data-reveal>
            Faça parte da rede Doces Prigor.
          </p>
          <div className="mt-11 flex flex-col gap-3 sm:flex-row" data-reveal>
            <a href="#cadastro" className="btn btn-gold !h-auto !min-h-[3.6rem] !whitespace-normal !py-3 text-center" data-track="cta_vender" data-track-label="b2b:final">
              Quero levar Prigor para meu negócio <ArrowRight size={16} className="shrink-0" />
            </a>
            <a href={wa} target="_blank" rel="noopener" className="btn btn-outline-light" data-track="whatsapp_click" data-track-label="b2b:final">
              <WhatsAppIcon size={18} /> WhatsApp
            </a>
          </div>
        </div>
      </section>

      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Início', path: '/' },
            { name: 'Seja um revendedor', path: '/seja-um-revendedor' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: content.resellerFaq.map((f) => ({
              '@type': 'Question',
              name: f.question,
              acceptedAnswer: { '@type': 'Answer', text: f.answer },
            })),
          },
        ]}
      />
    </>
  );
}
