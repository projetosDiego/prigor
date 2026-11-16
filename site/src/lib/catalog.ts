import 'server-only';
import { unstable_cache } from 'next/cache';
import type { PointOfSale, Product } from '@prisma/client';

import { db } from './db';
import { parseList } from './text';

export const CATALOG_TAG = 'catalog';
export const POINTS_TAG = 'points';

export type ProductView = Omit<Product, 'flavors' | 'gallery' | 'createdAt' | 'updatedAt'> & { flavors: string[]; gallery: string[] };

function toView({ createdAt: _c, updatedAt: _u, ...p }: Product): ProductView {
  return { ...p, flavors: parseList(p.flavors), gallery: parseList(p.gallery) };
}

export const getActiveProducts = unstable_cache(
  async (): Promise<ProductView[]> => {
    const rows = await db.product.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    return rows.map(toView);
  },
  ['active-products'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export async function getProductBySlug(slug: string): Promise<ProductView | null> {
  const all = await getActiveProducts();
  return all.find((p) => p.slug === slug) ?? null;
}

export type PointView = Omit<PointOfSale, 'createdAt' | 'updatedAt' | 'notes'>;

export const getActivePoints = unstable_cache(
  async (): Promise<PointView[]> => {
    const rows = await db.pointOfSale.findMany({
      where: { active: true },
      orderBy: [{ city: 'asc' }, { neighborhood: 'asc' }, { name: 'asc' }],
    });
    return rows.map(({ createdAt: _c, updatedAt: _u, notes: _n, ...rest }) => rest);
  },
  ['active-points'],
  { tags: [POINTS_TAG], revalidate: 3600 },
);

export async function getPointBySlug(slug: string): Promise<PointView | null> {
  const all = await getActivePoints();
  return all.find((p) => p.slug === slug) ?? null;
}
