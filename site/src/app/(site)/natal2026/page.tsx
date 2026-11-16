import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowDown, Building2, CalendarCheck, Gift, MapPin, ShoppingBag, Truck, Wallet } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { NatalProductCard } from '@/components/natal/ProductCard';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { Drip, vars } from '@/components/site/motion';
import { NATAL_GROUPS, getNatalSettings, natalCatalog } from '@/lib/natal/config';
import { describeDate } from '@/lib/natal/dates';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Cardápio de Natal 2026',
  description:
    'Guirlandas de brownie, taças, Brownie Box, presentes e chocotone no pote. Monte seu pedido de Natal da Doces Prigor pelo site e agende a entrega ou retirada.',
  alternates: { canonical: '/natal2026' },
  openGraph: { url: '/natal2026', images: ['/images/natal/g-guirlanda-red-velvet-1.webp'] },
};

export default async function NatalPage() {
  const [natal, settings] = await Promise.all([getNatalSettings(), getSettings()]);
  const catalog = natalCatalog(natal).filter((i) => i.active);
  const groups = NATAL_GROUPS.map((g) => ({ ...g, items: catalog.filter((i) => i.groupId === g.id) })).filter((g) => g.items.length > 0);
  const retail = groups.filter((g) => g.channel === 'varejo');
  const corporate = groups.find((g) => g.channel === 'empresa');
  const { start, end } = natal.dates;
  const deliveryWindow = `${describeDate(start).day} de ${describeDate(start).month} a ${describeDate(end).day} de ${describeDate(end).month}`;
  const waNatal = waLink(settings.contact.whatsapp, settings.messages.natal);
  const waCorp = waLink(settings.contact.whatsapp, 'Olá! Quero um orçamento de presentes de Natal da Doces Prigor para a minha empresa.');

  return (
    <>
      {/* ============ Abertura ============ */}
      <section className="natal-paper relative isolate overflow-hidden">
        <Image src="/images/natal/deco-ramo.webp" alt="" width={310} height={677} className="pointer-events-none absolute -top-12 -left-12 -z-10 w-20 -rotate-12 opacity-40 md:-top-10 md:-left-10 md:w-44 md:opacity-80" aria-hidden="true" />
        <div className="container-x grid items-center gap-10 pt-8 pb-14 md:pt-10 md:pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <p className="eyebrow animate-fade-up !text-berry">Natal Prigor {natal.year}</p>
            <h1 className="display-xl mt-5 animate-fade-up text-cocoa [animation-delay:90ms]">
              Cardápio de <em className="text-berry">Natal</em>
            </h1>
            <p className="lead mt-5 max-w-xl animate-fade-up [animation-delay:180ms]">
              Guirlandas de brownie, taças para a ceia e presentes que abraçam. Escolha, monte seu carrinho e agende a entrega ou a retirada.
            </p>
            <div className="mt-7 flex animate-fade-up flex-col gap-3 [animation-delay:260ms] sm:flex-row">
              <a href="#cardapio" className="btn btn-primary">
                Ver o cardápio <ArrowDown size={16} />
              </a>
              {corporate && (
                <a href="#empresas" className="btn btn-outline">
                  <Building2 size={16} /> Para empresas
                </a>
              )}
            </div>
            <ul className="mt-7 grid max-w-xl gap-3 animate-fade-up text-[0.92rem] text-cocoa [animation-delay:340ms] sm:grid-cols-2">
              {natal.rules.bulkPct > 0 && (
                <li className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                  <Gift size={18} className="mt-0.5 shrink-0 text-berry" />
                  <span>
                    <strong>{natal.rules.bulkPct}% de desconto</strong> a partir de {natal.rules.bulkQty} unidades do mesmo produto
                  </span>
                </li>
              )}
              <li className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                <CalendarCheck size={18} className="mt-0.5 shrink-0 text-berry" />
                <span>
                  Entregas e retiradas de <strong>{deliveryWindow}</strong>
                </span>
              </li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[19rem] sm:max-w-sm lg:max-w-[min(30rem,calc((100svh-15rem)*0.8))]">
            <div className="arch relative aspect-[4/5] animate-fade-up shadow-[0_60px_90px_-60px_rgb(36_19_15_/_0.6)] [animation-delay:150ms]">
              <Image
                src="/images/natal/g-guirlanda-red-velvet-1.webp"
                alt="Guirlanda Red Velvet com morangos, frutas vermelhas e brigadeiro de cream cheese"
                fill
                preload
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="animate-hero-zoom object-cover"
              />
            </div>
            <Image src="/images/natal/deco-arvore.webp" alt="" width={575} height={700} className="absolute -bottom-8 -left-6 w-24 animate-float md:-left-14 md:w-36" aria-hidden="true" />
            <Image src="/images/natal/deco-presente.webp" alt="" width={277} height={355} className="absolute -top-6 -right-3 w-20 rotate-12 md:-right-8 md:w-24" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ============ Navegação por categoria ============ */}
      <nav id="cardapio" aria-label="Categorias do cardápio" className="sticky top-[66px] z-30 scroll-mt-20 border-y border-line bg-cream/92 backdrop-blur-xl lg:top-[72px]">
        <div className="container-x hide-scrollbar flex gap-2 overflow-x-auto py-3">
          {groups.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="chip shrink-0 whitespace-nowrap">
              {g.title}
            </a>
          ))}
        </div>
      </nav>

      {/* ============ Varejo ============ */}
      <div className="pt-16 md:pt-24">
        {retail.map((g, gi) => (
          <section key={g.id} id={g.id} className="container-x scroll-mt-36 pb-14 md:pb-20" aria-labelledby={`${g.id}-title`}>
            <div className="mb-10 flex flex-col justify-between gap-3 border-b border-cocoa/15 pb-6 md:flex-row md:items-end" data-reveal>
              <div>
                <p className="font-display text-sm text-berry italic">{String(gi + 1).padStart(2, '0')}</p>
                <h2 id={`${g.id}-title`} className="display-md mt-1 text-cocoa">
                  {g.title}
                </h2>
              </div>
              <p className="max-w-md text-muted md:text-right">{g.subtitle}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {g.items.map((item, i) => (
                <NatalProductCard key={item.sku} item={item} acceptingOrders={natal.acceptingOrders} priority={gi === 0 && i < 2} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ============ Empresas ============ */}
      {corporate && (
        <section id="empresas" className="on-dark grain relative isolate scroll-mt-28 overflow-hidden bg-cocoa py-16 md:py-24" aria-labelledby="empresas-title">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_100%_0%,rgb(185_154_101_/_0.22),transparent_70%)]" />
          <div className="container-x">
            <div className="grid items-end gap-10 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="eyebrow" data-reveal>
                  Natal corporativo
                </p>
                <h2 id="empresas-title" className="display-lg mt-6" data-reveal>
                  Presentes de Natal para a sua empresa.
                </h2>
                <p className="lead mt-6 max-w-2xl" data-reveal>
                  Para presentear equipe, clientes e parceiros com a felicidade em forma de brownie. Preços especiais para pedidos com CNPJ.
                </p>
              </div>
              <div className="flex flex-col gap-3 lg:items-end" data-reveal>
                <a href={waCorp} target="_blank" rel="noopener" className="btn btn-outline-light" data-track="whatsapp_click" data-track-label="natal:empresas">
                  <WhatsAppIcon size={18} /> Falar com o comercial
                </a>
              </div>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {corporate.items.map((item) => (
                <NatalProductCard key={item.sku} item={item} acceptingOrders={natal.acceptingOrders} />
              ))}
            </div>
            <p className="mt-8 text-[0.9rem] text-cream/60" data-reveal>
              Os preços para empresas já são especiais e não somam com o desconto por quantidade. Precisa de cartão personalizado, outra quantidade ou outro produto? Fale com o comercial.
            </p>
          </div>
        </section>
      )}

      {/* ============ Como funciona ============ */}
      <section className="relative pt-16 pb-16 md:pt-24 md:pb-24" aria-labelledby="como-title">
        {corporate && <Drip />}
        <div className="container-x">
          <p className="eyebrow" data-reveal>
            Como funciona
          </p>
          <h2 id="como-title" className="display-md mt-5 text-cocoa" data-reveal>
            Do carrinho até a sua mesa.
          </h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {[
              { icon: ShoppingBag, title: 'Monte o carrinho', text: 'Escolha os produtos, recheios e quantidades.' },
              { icon: CalendarCheck, title: 'Agende a data', text: 'Escolha o melhor dia para receber ou retirar o pedido.' },
              {
                icon: Wallet,
                title: 'Confirme com o sinal',
                text: `Pague ${natal.depositPct}% de sinal ou o valor total. O Pix sai pronto, com o valor do pedido.`,
              },
              { icon: Truck, title: 'Receba ou retire', text: 'Confirmamos tudo pelo WhatsApp e o seu Natal fica mais gostoso.' },
            ].map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative border-t border-cocoa/20 pt-7" data-reveal style={vars({ '--reveal-delay': `${i * 100}ms` })}>
                <span className="absolute -top-px left-0 h-px w-14 bg-berry" aria-hidden="true" />
                <Icon size={26} strokeWidth={1.4} className="text-berry" />
                <h3 className="mt-5 text-2xl text-cocoa">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-16 grid gap-5 md:grid-cols-2">
            <div className="rounded-[1.6rem] bg-cream-2 p-8" data-reveal>
              <Truck size={22} className="text-berry" />
              <h3 className="mt-4 text-2xl text-cocoa">Entrega</h3>
              <p className="mt-2 leading-relaxed text-muted">{natal.deliveryNote}</p>
            </div>
            <div className="rounded-[1.6rem] bg-cream-2 p-8" data-reveal>
              <MapPin size={22} className="text-berry" />
              <h3 className="mt-4 text-2xl text-cocoa">Retirada</h3>
              <p className="mt-2 leading-relaxed text-muted">
                Retire sem taxa de entrega no ponto mais perto de você: {natal.pickupPoints.join(', ').replace(/, ([^,]*)$/, ' ou $1')}. O endereço vai junto com a confirmação.
              </p>
            </div>
          </div>
          <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted" data-reveal>
            Ficou com alguma dúvida?
            <a href={waNatal} target="_blank" rel="noopener" className="inline-flex items-center gap-2 font-bold text-[#1f7a4d] hover:underline" data-track="whatsapp_click" data-track-label="natal:duvidas">
              <WhatsAppIcon size={17} /> Chame no WhatsApp
            </a>
          </p>
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Início', path: '/' },
          { name: `Cardápio de Natal ${natal.year}`, path: '/natal2026' },
        ])}
      />
    </>
  );
}
