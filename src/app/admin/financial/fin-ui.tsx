'use client';

import React from 'react';
import { X } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const monthLabel = (m: string) =>
  new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shortMonth = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');

export const inputCls = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';
export const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50';
export const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800 disabled:opacity-50';

export const CATEGORIES = [
  'Ingredientes', 'Embalagens', 'Salários e pró-labore', 'Comissões de Vendas', 'Aluguel', 'Energia, água e gás',
  'Internet e telefone', 'Combustível e entregas', 'Marketing', 'Manutenção', 'Impostos e taxas', 'Tarifas bancárias', 'Equipamentos', 'Outros',
];

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível concluir.'));
  const json = await res.json().catch(() => ({}));
  return ((json as { data?: T }).data ?? json) as T;
}

export const parseMoney = (s: string) => {
  const t = s.trim();
  if (!t) return 0;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : 0;
};

export function Kpi({ label, value, sub, tone = 'text-stone-900', onClick }: { label: string; value: string; sub?: string; tone?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`rounded-xl border border-stone-200 bg-white p-4 text-left ${onClick ? 'transition hover:border-amber-300 hover:shadow-sm' : ''}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-stone-500">{sub}</div>}
    </Tag>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-2xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="text-base font-black text-stone-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-bold text-stone-600 ${className}`}>
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

export interface AccountLite {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  balance: number;
  kind: string;
  openingBalance: number;
  openingDate: string;
}
export interface SupplierLite {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
}
