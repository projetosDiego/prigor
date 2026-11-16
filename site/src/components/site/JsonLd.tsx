import type { Settings } from '@/lib/settings';
import { absoluteUrl, SLOGAN } from '@/lib/site';
import { instagramHandle } from '@/lib/text';
import { waNumber } from '@/lib/whatsapp';

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON serializado no servidor; "<" escapado para não fechar a tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function organizationJsonLd(settings: Settings): Record<string, unknown> {
  const ig = instagramHandle(settings.contact.instagram);
  const phone = waNumber(settings.contact.whatsapp);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': absoluteUrl('/#organization'),
        name: 'Doces Prigor',
        slogan: SLOGAN,
        url: absoluteUrl('/'),
        logo: absoluteUrl('/brand/logo-doces-prigor.png'),
        sameAs: ig ? [`https://www.instagram.com/${ig}/`] : [],
        ...(phone
          ? {
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: `+${phone}`,
                contactType: 'customer service',
                areaServed: 'BR',
                availableLanguage: 'Portuguese',
              },
            }
          : {}),
        ...(settings.contact.email ? { email: settings.contact.email } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        url: absoluteUrl('/'),
        name: 'Doces Prigor',
        inLanguage: 'pt-BR',
        publisher: { '@id': absoluteUrl('/#organization') },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
