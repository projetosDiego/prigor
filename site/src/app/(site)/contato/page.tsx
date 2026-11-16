import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Mail, MapPin, Store } from 'lucide-react';

import { InstagramIcon, WhatsAppIcon } from '@/components/icons';
import { PageHero } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { getSettings } from '@/lib/settings';
import { formatPhone, instagramHandle } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Fale com a Doces Prigor pelo WhatsApp ou Instagram. Saiba onde encontrar os brownies ou como revender.',
  alternates: { canonical: '/contato' },
};

export default async function ContactPage() {
  const { contact, messages } = await getSettings();
  const ig = instagramHandle(contact.instagram);

  const cards = [
    {
      icon: MapPin,
      title: 'Quero experimentar',
      text: 'Descubra o ponto de venda mais perto de você.',
      primary: { href: '/onde-encontrar', label: 'Ver pontos de venda', track: 'cta_experimentar' },
      secondary: { href: waLink(contact.whatsapp, messages.findPoint), label: 'Quero saber onde encontrar' },
    },
    {
      icon: Store,
      title: 'Quero revender Prigor',
      text: 'Tem um estabelecimento e quer revender Doces Prigor?',
      primary: { href: '/seja-um-revendedor', label: 'Fazer cadastro', track: 'cta_vender' },
      secondary: { href: waLink(contact.whatsapp, messages.reseller), label: 'Quero revender' },
    },
  ];

  return (
    <>
      <PageHero eyebrow="Contato" title="Fale com a Doces Prigor." text="Escolha o assunto e a gente segue a conversa pelo canal certo." image="/images/macro-selo.webp" imagePosition="center 30%" />

      <section className="container-x pb-14 md:pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          {cards.map(({ icon: Icon, ...card }, i) => (
            <article key={card.title} className="lift rounded-[1.6rem] border border-line bg-white/70 p-7 md:p-10" data-reveal style={{ ['--reveal-delay' as string]: `${i * 90}ms` }}>
              <Icon className="text-bronze" size={28} strokeWidth={1.5} />
              <h2 className="mt-6 text-3xl font-medium text-cocoa">{card.title}</h2>
              <p className="mt-2 text-muted">{card.text}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={card.primary.href} className="btn btn-primary" data-track={card.primary.track} data-track-label="contato">
                  {card.primary.label} <ArrowRight size={16} />
                </Link>
                <a href={card.secondary.href} target="_blank" rel="noopener" className="btn btn-outline" data-track="whatsapp_click" data-track-label={`contato:${card.title}`}>
                  <WhatsAppIcon size={17} /> {card.secondary.label}
                </a>
              </div>
            </article>
          ))}
        </div>

        <div className="on-dark mt-5 grid gap-5 rounded-[1.6rem] bg-cocoa p-7 text-cream md:grid-cols-3 md:p-10" data-reveal>
          <div className="md:col-span-1">
            <p className="font-display text-3xl">Outros assuntos</p>
            <p className="mt-2 text-cream/70">Parcerias, imprensa, sugestões ou qualquer outra conversa.</p>
          </div>
          <ul className="grid gap-4 md:col-span-2 md:grid-cols-2">
            {contact.whatsapp && (
              <li>
                <a href={waLink(contact.whatsapp, messages.general)} target="_blank" rel="noopener" className="flex h-full items-center gap-4 rounded-2xl bg-cream/5 p-5 transition hover:bg-cream/10" data-track="whatsapp_click" data-track-label="contato:geral">
                  <WhatsAppIcon size={26} />
                  <span>
                    <span className="block text-xs font-bold tracking-widest text-bronze-2 uppercase">WhatsApp</span>
                    <span className="text-lg">{formatPhone(contact.whatsapp)}</span>
                  </span>
                </a>
              </li>
            )}
            {ig && (
              <li>
                <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener" className="flex h-full items-center gap-4 rounded-2xl bg-cream/5 p-5 transition hover:bg-cream/10" data-track="instagram_click" data-track-label="contato">
                  <InstagramIcon size={26} />
                  <span>
                    <span className="block text-xs font-bold tracking-widest text-bronze-2 uppercase">Instagram</span>
                    <span className="text-lg">@{ig}</span>
                  </span>
                </a>
              </li>
            )}
            {contact.email && (
              <li>
                <a href={`mailto:${contact.email}`} className="flex h-full items-center gap-4 rounded-2xl bg-cream/5 p-5 transition hover:bg-cream/10">
                  <Mail size={26} strokeWidth={1.5} />
                  <span>
                    <span className="block text-xs font-bold tracking-widest text-bronze-2 uppercase">E-mail</span>
                    <span className="text-lg break-all">{contact.email}</span>
                  </span>
                </a>
              </li>
            )}
          </ul>
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Início', path: '/' },
          { name: 'Contato', path: '/contato' },
        ])}
      />
    </>
  );
}
