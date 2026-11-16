import 'server-only';
import { unstable_cache } from 'next/cache';

import { db } from '../db';
import { NATAL_DEFAULT_ITEMS, NATAL_GROUPS, type NatalItem } from './catalog';
import type { DateRules } from './dates';
import type { PricingRules } from './pricing';

/**
 * Configuração da campanha de Natal, editável em /admin/natal.
 * Guardada na tabela Setting (chave "natal"); o que não estiver salvo usa o padrão.
 */
export type NatalSettings = {
  /** Mostra a página e o banner na home */
  active: boolean;
  /** Aceita pedidos pelo site (desligue quando a produção lotar) */
  acceptingOrders: boolean;
  year: number;
  dates: DateRules;
  pickupPoints: string[];
  deliveryNote: string;
  depositPct: number;
  rules: PricingRules;
  pix: { key: string; name: string; city: string };
  /** Ajustes por produto: preço (centavos) e se está à venda */
  overrides: Record<string, { priceCents?: number; active?: boolean }>;
};

export const NATAL_DEFAULTS: NatalSettings = {
  active: true,
  acceptingOrders: true,
  year: 2026,
  dates: { start: '2026-12-01', end: '2026-12-24', leadDays: 2, closedWeekdays: [0], blockedDates: [] },
  pickupPoints: ['Méier', 'São Cristóvão', 'Centro'],
  deliveryNote:
    'Entregamos em várias áreas da cidade. A taxa de entrega muda conforme a sua localização e é combinada pelo WhatsApp na confirmação do pedido.',
  depositPct: 50,
  rules: { bulkQty: 10, bulkPct: 12 },
  pix: { key: '', name: 'Doces Prigor', city: 'Rio de Janeiro' },
  overrides: {},
};

export const NATAL_TAG = 'natal';

function sanitize(raw: unknown): NatalSettings {
  const d = NATAL_DEFAULTS;
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<NatalSettings>;
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const dates = (s.dates ?? {}) as Partial<DateRules>;
  const overrides: NatalSettings['overrides'] = {};
  if (s.overrides && typeof s.overrides === 'object') {
    for (const [sku, o] of Object.entries(s.overrides)) {
      if (!o || typeof o !== 'object') continue;
      overrides[sku] = {
        ...(typeof o.priceCents === 'number' && o.priceCents > 0 ? { priceCents: Math.round(o.priceCents) } : {}),
        ...(typeof o.active === 'boolean' ? { active: o.active } : {}),
      };
    }
  }
  return {
    active: typeof s.active === 'boolean' ? s.active : d.active,
    acceptingOrders: typeof s.acceptingOrders === 'boolean' ? s.acceptingOrders : d.acceptingOrders,
    year: num(s.year, d.year),
    dates: {
      start: str(dates.start, d.dates.start),
      end: str(dates.end, d.dates.end),
      leadDays: num(dates.leadDays, d.dates.leadDays),
      closedWeekdays: Array.isArray(dates.closedWeekdays) ? dates.closedWeekdays.filter((n) => Number.isInteger(n)) : d.dates.closedWeekdays,
      blockedDates: Array.isArray(dates.blockedDates) ? dates.blockedDates.filter((x) => typeof x === 'string') : d.dates.blockedDates,
    },
    pickupPoints: Array.isArray(s.pickupPoints) ? s.pickupPoints.filter((x) => typeof x === 'string' && x.trim()) : d.pickupPoints,
    deliveryNote: str(s.deliveryNote, d.deliveryNote),
    depositPct: Math.min(100, Math.max(0, num(s.depositPct, d.depositPct))),
    rules: {
      bulkQty: Math.max(1, num(s.rules?.bulkQty, d.rules.bulkQty)),
      bulkPct: Math.min(90, Math.max(0, num(s.rules?.bulkPct, d.rules.bulkPct))),
    },
    pix: {
      key: str(s.pix?.key, d.pix.key),
      name: str(s.pix?.name, d.pix.name),
      city: str(s.pix?.city, d.pix.city),
    },
    overrides,
  };
}

export const getNatalSettings = unstable_cache(
  async (): Promise<NatalSettings> => {
    const row = await db.setting.findUnique({ where: { key: 'natal' } });
    if (!row) return NATAL_DEFAULTS;
    try {
      return sanitize(JSON.parse(row.value));
    } catch {
      return NATAL_DEFAULTS;
    }
  },
  ['natal-settings'],
  { tags: [NATAL_TAG], revalidate: 3600 },
);

export async function saveNatalSettings(value: NatalSettings): Promise<void> {
  const clean = sanitize(value);
  await db.setting.upsert({
    where: { key: 'natal' },
    create: { key: 'natal', value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
}

/** Catálogo com os ajustes do painel aplicados (preço e disponibilidade). */
export function natalCatalog(settings: NatalSettings): NatalItem[] {
  return NATAL_DEFAULT_ITEMS.map((item) => {
    const o = settings.overrides[item.sku];
    return { ...item, priceCents: o?.priceCents ?? item.priceCents, active: o?.active ?? item.active };
  });
}

export { NATAL_GROUPS };
