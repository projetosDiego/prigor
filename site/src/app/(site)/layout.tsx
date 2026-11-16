import Link from 'next/link';

import { AnalyticsListener } from '@/components/site/AnalyticsListener';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';
import { RevealObserver } from '@/components/site/Reveal';
import { ThirdPartyScripts } from '@/components/site/ThirdPartyScripts';
import { WhatsAppFloat } from '@/components/site/WhatsAppFloat';
import { JsonLd, organizationJsonLd } from '@/components/site/JsonLd';
import { getActiveProducts } from '@/lib/catalog';
import { getNatalSettings } from '@/lib/natal/config';
import { getSettings } from '@/lib/settings';
import { instagramHandle } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, products, natal] = await Promise.all([getSettings(), getActiveProducts(), getNatalSettings()]);
  const { contact, messages, integrations } = settings;
  const ig = instagramHandle(contact.instagram);

  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-cocoa focus:px-5 focus:py-3 focus:text-cream">
        Pular para o conteúdo
      </a>
      {natal.active && (
        <Link
          href="/natal2026"
          className="block bg-berry px-4 py-2.5 text-center text-[0.74rem] font-bold tracking-[0.06em] text-cream transition-colors hover:bg-berry-2"
          data-track="natal_click"
          data-track-label="faixa-topo"
        >
          Cardápio de Natal {natal.year}<span className="max-sm:hidden"> · encomende pelo site e agende a entrega</span> →
        </Link>
      )}
      <Header whatsappHref={waLink(contact.whatsapp, messages.general)} instagramHref={`https://www.instagram.com/${ig}/`} />
      <main id="conteudo">{children}</main>
      <Footer settings={settings} />
      <WhatsAppFloat number={contact.whatsapp} messages={messages} products={Object.fromEntries(products.map((p) => [p.slug, p.name]))} />
      <RevealObserver />
      <AnalyticsListener />
      <ThirdPartyScripts ga4Id={integrations.ga4Id} gtmId={integrations.gtmId} metaPixelId={integrations.metaPixelId} />
      <JsonLd data={organizationJsonLd(settings)} />
    </>
  );
}
