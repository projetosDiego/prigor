import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { PageHero } from '@/components/site/blocks';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { PointFinder } from '@/components/site/PointFinder';
import { getActivePoints } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const metadata: Metadata = {
  title: 'Onde comprar brownie Doces Prigor',
  description:
    'Encontre o ponto de venda Doces Prigor mais perto de você. Busque por bairro, cidade, CEP ou use sua localização.',
  alternates: { canonical: '/onde-encontrar' },
  openGraph: { url: '/onde-encontrar', images: ['/images/expositor-balcao.webp'] },
};

type Props = { searchParams: Promise<{ q?: string; perto?: string }> };

export default async function FindPage({ searchParams }: Props) {
  const [{ q, perto }, points, settings] = await Promise.all([searchParams, getActivePoints(), getSettings()]);
  const { content, contact, messages } = settings;

  return (
    <>
      <PageHero eyebrow="Onde encontrar" title={content.findTitle} text={content.findLead} image="/images/expositor-balcao.webp" imagePosition="center 38%" />

      <section className="container-x pb-14 md:pb-20">
        <PointFinder
          points={points}
          pointMessage={messages.point}
          findWhatsappHref={waLink(contact.whatsapp, messages.findPoint)}
          initialQuery={typeof q === 'string' ? q.slice(0, 80) : ''}
          autoLocate={perto === '1'}
        />
      </section>

      <section className="container-x pb-14 md:pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[1.6rem] bg-cream-2 p-8 md:p-10" data-reveal>
            <p className="font-display text-2xl text-cocoa md:text-3xl">Não achou um ponto perto?</p>
            <p className="mt-3 text-muted">Fale com a gente pelo WhatsApp e indicamos o ponto mais próximo de você.</p>
            <a href={waLink(contact.whatsapp, messages.findPoint)} target="_blank" rel="noopener" className="btn btn-whatsapp mt-7" data-track="whatsapp_click" data-track-label="onde-encontrar:rodape">
              <WhatsAppIcon size={18} /> Quero saber onde encontrar
            </a>
          </div>
          <div className="on-dark rounded-[1.6rem] bg-cocoa p-8 text-cream md:p-10" data-reveal>
            <p className="font-display text-2xl md:text-3xl">Quer a Doces Prigor no seu estabelecimento?</p>
            <p className="mt-3 text-cream/70">Seu negócio pode ser o próximo ponto desta lista.</p>
            <Link href="/seja-um-revendedor" className="btn btn-gold mt-7" data-track="cta_vender" data-track-label="onde-encontrar">
              Quero revender Prigor <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Início', path: '/' },
          { name: 'Onde encontrar', path: '/onde-encontrar' },
        ])}
      />
    </>
  );
}
