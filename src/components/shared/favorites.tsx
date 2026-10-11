'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';

export type FavoriteKind = 'produto' | 'ficha' | 'insumo' | 'recurso' | 'custo_fixo';
type FavoritesMap = Record<FavoriteKind, string[]>;

const EMPTY: FavoritesMap = { produto: [], ficha: [], insumo: [], recurso: [], custo_fixo: [] };

/** Carrega os favoritos e devolve `isFav`, `toggle` (otimista) e `sortFavFirst` (estável). */
export function useFavorites() {
  const [map, setMap] = useState<FavoritesMap>(EMPTY);

  useEffect(() => {
    let alive = true;
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setMap({ ...EMPTY, ...j });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const isFav = useCallback((kind: FavoriteKind, id: string | null | undefined) => !!id && map[kind].includes(id), [map]);

  const toggle = useCallback(
    async (kind: FavoriteKind, id: string) => {
      const was = map[kind].includes(id);
      setMap((m) => ({ ...m, [kind]: was ? m[kind].filter((x) => x !== id) : [...m[kind], id] }));
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, refId: id, favorite: !was }),
        });
        if (!res.ok) throw new Error('falhou');
      } catch {
        setMap((m) => ({ ...m, [kind]: was ? [...m[kind], id] : m[kind].filter((x) => x !== id) }));
      }
    },
    [map],
  );

  /** Favoritos primeiro, mantendo a ordem original dentro de cada grupo. */
  const sortFavFirst = useCallback(
    <T,>(items: T[], pick: (item: T) => { kind: FavoriteKind; id: string | null | undefined }): T[] => {
      const fav: T[] = [];
      const rest: T[] = [];
      for (const it of items) {
        const { kind, id } = pick(it);
        (id && map[kind].includes(id) ? fav : rest).push(it);
      }
      return [...fav, ...rest];
    },
    [map],
  );

  return { isFav, toggle, sortFavFirst };
}

export function FavStar({ active, onToggle, className = '' }: { active: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={active ? 'Remover dos favoritos' : 'Favoritar (fica no topo)'}
      aria-label={active ? 'Remover dos favoritos' : 'Favoritar'}
      aria-pressed={active}
      className={`rounded p-1 transition hover:bg-amber-50 ${className}`}
    >
      <Star className={`h-4 w-4 ${active ? 'fill-amber-400 text-amber-500' : 'text-stone-300 hover:text-amber-400'}`} />
    </button>
  );
}
