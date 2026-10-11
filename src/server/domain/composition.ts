/**
 * Composição de produtos para relatório de unidades.
 * Ex.: "Display com 12" = 12 × "Brownie 7x5". Vender 82 displays são 984 brownies 7x5.
 * Um produto que tem componentes é tratado como kit: só os componentes contam como unidade-base.
 */

export interface ComponentLink {
  componentId: string;
  quantity: number;
}

export interface SoldRow {
  productId: string;
  quantity: number;
}

export interface ExpandedUnits {
  /** Unidades-base vendidas diretamente (produto sem composição). */
  direct: Map<string, number>;
  /** Unidades-base vindas de kits (displays etc.). */
  viaKits: Map<string, number>;
  /** Por kit: unidades-base que ele gerou. */
  perKit: Map<string, Map<string, number>>;
}

const MAX_DEPTH = 5;

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function expandSales(sold: SoldRow[], links: Map<string, ComponentLink[]>): ExpandedUnits {
  const direct = new Map<string, number>();
  const viaKits = new Map<string, number>();
  const perKit = new Map<string, Map<string, number>>();

  function walk(productId: string, qty: number, kitId: string | null, path: Set<string>, depth: number) {
    const children = links.get(productId);
    if (!children || children.length === 0 || depth > MAX_DEPTH || path.has(productId)) {
      if (kitId) {
        add(viaKits, productId, qty);
        const m = perKit.get(kitId) ?? new Map<string, number>();
        add(m, productId, qty);
        perKit.set(kitId, m);
      } else add(direct, productId, qty);
      return;
    }
    const next = new Set(path).add(productId);
    for (const c of children) walk(c.componentId, qty * c.quantity, kitId ?? productId, next, depth + 1);
  }

  for (const row of sold) {
    if (!(row.quantity > 0)) continue;
    walk(row.productId, row.quantity, null, new Set(), 0);
  }
  return { direct, viaKits, perKit };
}
