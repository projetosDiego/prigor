'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';

import { requireAdmin } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { NATAL_DEFAULT_ITEMS } from '@/lib/natal/catalog';
import { NATAL_TAG, getNatalSettings, saveNatalSettings, type NatalSettings } from '@/lib/natal/config';
import { retryPendingOrders, sendOrderToErp } from '@/lib/orders/erp';
import { ORDER_STATUS } from '@/lib/orders/types';
import type { ActionState } from './actions';

const str = (fd: FormData, key: string, max = 2000) => String(fd.get(key) ?? '').trim().slice(0, max);
const bool = (fd: FormData, key: string) => fd.get(key) === 'on';

/** "64,90" / "64.90" / "R$ 64,90" → 6490 (centavos). */
function toCents(raw: string): number | null {
  const clean = raw.replace(/[^\d,.]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

/* ============================== Pedidos ============================== */

export async function updateOrderAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const status = str(fd, 'status', 40);
  const data: { status?: string; adminNotes?: string } = { adminNotes: str(fd, 'adminNotes', 2000) };
  if (status in ORDER_STATUS) data.status = status;
  await db.shopOrder.update({ where: { id }, data });
  revalidatePath('/admin/pedidos');
  redirect(`/admin/pedidos/${id}?salvo=1`);
}

export async function resendOrderAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, 'id', 40);
  const order = await db.shopOrder.findUnique({ where: { id } });
  if (order) await sendOrderToErp(order);
  revalidatePath('/admin/pedidos');
  redirect(`/admin/pedidos/${id}?erp=1`);
}

export async function resendPendingAction(): Promise<void> {
  await requireAdmin();
  const r = await retryPendingOrders(20);
  revalidatePath('/admin/pedidos');
  redirect(`/admin/pedidos?enviados=${r.sent}&falhas=${r.failed}`);
}

/* ============================== Natal ============================== */

export async function saveNatalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const current = await getNatalSettings();

  const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const start = str(fd, 'start', 10);
  const end = str(fd, 'end', 10);
  if (!dateOk(start) || !dateOk(end) || end < start) return { error: 'Confira o período de entregas (início antes do fim).' };

  const blockedDates = str(fd, 'blockedDates', 2000)
    .split(/[\s,;]+/)
    .map((v) => {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
      return m ? `${m[3] ?? start.slice(0, 4)}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : v;
    })
    .filter(dateOk);

  const overrides: NatalSettings['overrides'] = {};
  for (const item of NATAL_DEFAULT_ITEMS) {
    const price = toCents(str(fd, `price_${item.sku}`, 20));
    overrides[item.sku] = {
      ...(price && price !== item.priceCents ? { priceCents: price } : {}),
      active: bool(fd, `active_${item.sku}`),
    };
  }

  const next: NatalSettings = {
    ...current,
    active: bool(fd, 'active'),
    acceptingOrders: bool(fd, 'acceptingOrders'),
    dates: {
      start,
      end,
      leadDays: Math.max(0, Math.min(30, Number.parseInt(str(fd, 'leadDays', 3), 10) || 0)),
      closedWeekdays: fd.getAll('closedWeekdays').map((v) => Number(v)).filter((n) => n >= 0 && n <= 6),
      blockedDates,
    },
    pickupPoints: str(fd, 'pickupPoints', 600).split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean),
    deliveryNote: str(fd, 'deliveryNote', 600) || current.deliveryNote,
    depositPct: Math.max(10, Math.min(100, Number.parseInt(str(fd, 'depositPct', 3), 10) || 50)),
    rules: {
      bulkQty: Math.max(2, Number.parseInt(str(fd, 'bulkQty', 4), 10) || 10),
      bulkPct: Math.max(0, Math.min(50, Number(str(fd, 'bulkPct', 5).replace(',', '.')) || 0)),
    },
    pix: { key: str(fd, 'pixKey', 120), name: str(fd, 'pixName', 25) || 'Doces Prigor', city: str(fd, 'pixCity', 15) || 'Rio de Janeiro' },
    overrides,
  };
  if (next.pickupPoints.length === 0) return { error: 'Informe pelo menos um ponto de retirada.' };

  await saveNatalSettings(next);
  updateTag(NATAL_TAG);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Cardápio de Natal salvo e publicado.' };
}
