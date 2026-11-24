'use client';

import React from 'react';
import { X } from 'lucide-react';

import { apiErrorMessage } from '@/lib/errors';

export async function api<T>(url: string, init?: { method?: string; body?: unknown }, fallback = 'Erro na operação.'): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(apiErrorMessage(json, fallback));
  return json as T;
}

export const fmtUnits = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const inputCls = 'w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-stone-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-stone-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-amber-700" />
      {label}
    </label>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível',
  usado: 'Usado',
  anulado: 'Anulado',
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export const SOURCE_LABEL: Record<string, string> = {
  boas_vindas: 'Cadastro',
  pontos: 'Troca de pontos',
  manual: 'Cortesia',
  segunda_via: 'Segunda via',
};
