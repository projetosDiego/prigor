/** Favoritos: itens que o usuário quer ver sempre no topo das listas (produtos, fichas, insumos…). */
import { prisma } from '../db';

export const FAVORITE_KINDS = ['produto', 'ficha', 'insumo', 'recurso', 'custo_fixo'] as const;
export type FavoriteKind = (typeof FAVORITE_KINDS)[number];

export type FavoritesDTO = Record<FavoriteKind, string[]>;

export async function listFavorites(): Promise<FavoritesDTO> {
  const rows = await prisma.favorite.findMany({ select: { kind: true, refId: true } });
  const out: FavoritesDTO = { produto: [], ficha: [], insumo: [], recurso: [], custo_fixo: [] };
  for (const r of rows) {
    if ((FAVORITE_KINDS as readonly string[]).includes(r.kind)) out[r.kind as FavoriteKind].push(r.refId);
  }
  return out;
}

export async function setFavorite(kind: FavoriteKind, refId: string, favorite: boolean): Promise<void> {
  if (favorite) {
    await prisma.favorite.upsert({ where: { kind_refId: { kind, refId } }, create: { kind, refId }, update: {} });
  } else {
    await prisma.favorite.deleteMany({ where: { kind, refId } });
  }
}
