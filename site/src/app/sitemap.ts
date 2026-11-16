import type { MetadataRoute } from 'next';

import { getActivePoints, getActiveProducts } from '@/lib/catalog';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, points] = await Promise.all([getActiveProducts(), getActivePoints()]);
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1, lastModified: now },
    { url: absoluteUrl('/produtos'), changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: absoluteUrl('/natal2026'), changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: absoluteUrl('/onde-encontrar'), changeFrequency: 'weekly', priority: 0.9, lastModified: now },
    { url: absoluteUrl('/seja-um-revendedor'), changeFrequency: 'monthly', priority: 0.9, lastModified: now },
    { url: absoluteUrl('/nossa-historia'), changeFrequency: 'monthly', priority: 0.6, lastModified: now },
    { url: absoluteUrl('/contato'), changeFrequency: 'yearly', priority: 0.5, lastModified: now },
    { url: absoluteUrl('/politica-de-privacidade'), changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/termos-de-uso'), changeFrequency: 'yearly', priority: 0.2 },
  ];

  return [
    ...pages,
    ...products.map((p) => ({ url: absoluteUrl(`/produtos/${p.slug}`), changeFrequency: 'monthly' as const, priority: 0.8 })),
    ...points.map((p) => ({ url: absoluteUrl(`/pontos-de-venda/${p.slug}`), changeFrequency: 'monthly' as const, priority: 0.6 })),
  ];
}
