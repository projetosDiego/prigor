import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, MapPin, Navigation, Phone } from 'lucide-react';

import { InstagramIcon, WhatsAppIcon } from '@/components/icons';
import { JsonLd, breadcrumbJsonLd } from '@/components/site/JsonLd';
import { getActivePoints, getActiveProducts, getPointBySlug } from '@/lib/catalog';
import { directionsUrl, fullAddress, mapEmbedUrl } from '@/lib/geo';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/site';
import { formatPhone, instagramHandle, onlyDigits } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const points = await getActivePoints();
  return points.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const point = await getPointBySlug(slug);
  if (!point) return { title: 'Ponto de venda não encontrado' };
  const where = [point.neighborhood, point.city].filter(Boolean).join(', ');
  return {
    title: `Doces Prigor em ${point.name}${where ? ` — ${where}` : ''}`,
    description: `Encontre brownies Doces Prigor em ${point.name}${where ? `, ${where}` : ''}. Endereço, horário e rota.`,
    alternates: { canonical: `/pontos-de-venda/${point.slug}` },
  };
}

export default async function PointPage({ params }: Props) {
  const { slug } = await params;
  const [point, settings, products] = await Promise.all([getPointBySlug(slug), getSettings(), getActiveProducts()]);
  if (!point) notFound();

  const ig = instagramHandle(point.instagram);
  const address = fullAddress(point);

  return (
    <>
      <div className="container-x pt-6 md:pt-10">
        <Link href="/onde-encontrar" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-cocoa">
          <ArrowLeft size={16} /> Todos os pontos
        </Link>
      </div>

      <section className="container-x grid gap-10 pt-8 pb-14 md:pb-20 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div>
          <p className="eyebrow">Ponto de venda Doces Prigor</p>
          <h1 className="mt-4 text-[2.5rem] leading-[1.04] font-medium text-cocoa md:text-6xl">{point.name}</h1>
          <p className="mt-3 text-lg text-muted">{[point.neighborhood, point.city, point.state].filter(Boolean).join(' · ')}</p>

          <ul className="mt-10 divide-y divide-line border-y border-line">
            {address && (
              <li className="flex gap-4 py-5">
                <MapPin className="mt-0.5 shrink-0 text-bronze" size={20} />
                <span className="text-cocoa">{address}</span>
              </li>
            )}
            {point.hours && (
              <li className="flex gap-4 py-5">
                <Clock className="mt-0.5 shrink-0 text-bronze" size={20} />
                <span className="whitespace-pre-line text-cocoa">{point.hours}</span>
              </li>
            )}
            {point.phone && (
              <li className="flex gap-4 py-5">
                <Phone className="mt-0.5 shrink-0 text-bronze" size={20} />
                <a href={`tel:+55${onlyDigits(point.phone)}`} className="text-cocoa hover:text-bronze">
                  {formatPhone(point.phone)}
                </a>
              </li>
            )}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={directionsUrl(point)} target="_blank" rel="noopener" className="btn btn-primary" data-track="point_directions" data-track-label={point.name}>
              <Navigation size={17} /> Como chegar
            </a>
            {point.whatsapp && (
              <a href={waLink(point.whatsapp, settings.messages.point)} target="_blank" rel="noopener" className="btn btn-outline" data-track="whatsapp_click" data-track-label={`ponto:${point.name}`}>
                <WhatsAppIcon size={17} /> WhatsApp
              </a>
            )}
            {ig && (
              <a href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener" className="btn btn-outline">
                <InstagramIcon size={17} /> @{ig}
              </a>
            )}
          </div>

          {products.length > 0 && (
            <div className="mt-12">
              <p className="text-[0.72rem] font-bold tracking-[0.2em] text-cocoa-3 uppercase">Conheça os produtos</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {products.slice(0, 6).map((p) => (
                  <Link key={p.id} href={`/produtos/${p.slug}`} className="rounded-full border border-line bg-white/60 px-4 py-2 text-sm font-semibold text-cocoa hover:border-cocoa">
                    {p.name}
                  </Link>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted">A disponibilidade de produtos e sabores pode variar em cada ponto.</p>
            </div>
          )}
        </div>

        <div className="self-start overflow-hidden rounded-[1.8rem] border border-line bg-sand">
          <iframe
            title={`Mapa: ${point.name}`}
            src={mapEmbedUrl(point)}
            className="aspect-[4/5] w-full md:aspect-square"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="container-x pb-14">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[1.6rem] bg-cocoa p-8 text-cream md:flex-row md:items-center md:p-10">
          <p className="font-display text-2xl md:text-3xl">Quer ver outros pontos?</p>
          <Link href="/onde-encontrar" className="btn btn-light" data-track="cta_experimentar" data-track-label="ponto">
            Ver todos os pontos <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Início', path: '/' },
            { name: 'Onde encontrar', path: '/onde-encontrar' },
            { name: point.name, path: `/pontos-de-venda/${point.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Place',
            name: point.name,
            url: absoluteUrl(`/pontos-de-venda/${point.slug}`),
            address: {
              '@type': 'PostalAddress',
              streetAddress: point.address,
              addressLocality: point.city,
              addressRegion: point.state,
              postalCode: point.zipCode,
              addressCountry: 'BR',
            },
            ...(point.latitude != null && point.longitude != null
              ? { geo: { '@type': 'GeoCoordinates', latitude: point.latitude, longitude: point.longitude } }
              : {}),
          },
        ]}
      />
    </>
  );
}
