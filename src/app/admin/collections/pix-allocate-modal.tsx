'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, Wand2, X } from 'lucide-react';

import { allocateFifo } from '@/server/domain/pix-allocation';
import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { PixRowDTO } from '@/server/services/pix';
import type { OpenTitle } from '@/server/domain/pix-match';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const cents = (v: number) => Math.round(v * 100);
const parseMoney = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmt = (c: number) => (c / 100).toFixed(2).replace('.', ',');

interface Props {
  row: PixRowDTO;
  openTitles: OpenTitle[];
  initialCustomerId: string | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}

/** Baixa total, parcial ou com sobra (vira crédito) — escolhendo cliente e quanto vai para cada título. */
export function PixAllocateModal({ row, openTitles, initialCustomerId, onClose, onDone }: Props) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initialCustomerId) return {};
    const plan = allocateFifo(
      cents(row.value),
      openTitles.filter((t) => t.customerId === initialCustomerId).map((t) => ({ id: t.transactionId, cents: cents(t.value), dueDate: t.dueDate })),
    );
    return Object.fromEntries(plan.allocations.map((a) => [a.transactionId, fmt(a.cents)]));
  });
  const [saving, setSaving] = useState(false);

  const customers = useMemo(() => {
    const map = new Map<string, { id: string; label: string; total: number; count: number }>();
    for (const t of openTitles) {
      const c = map.get(t.customerId) ?? { id: t.customerId, label: t.customerLabel, total: 0, count: 0 };
      c.total += t.value;
      c.count += 1;
      map.set(t.customerId, c);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [openTitles]);

  const titles = useMemo(
    () => openTitles.filter((t) => t.customerId === customerId).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [openTitles, customerId],
  );

  function auto(forCustomer = titles) {
    const plan = allocateFifo(
      cents(row.value),
      forCustomer.map((t) => ({ id: t.transactionId, cents: cents(t.value), dueDate: t.dueDate })),
    );
    const next: Record<string, string> = {};
    for (const a of plan.allocations) next[a.transactionId] = fmt(a.cents);
    setValues(next);
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
    const list = openTitles.filter((t) => t.customerId === id);
    auto(list);
  }

  const chosen = titles.flatMap((t) => {
    const c = cents(parseMoney(values[t.transactionId] ?? ''));
    return c > 0 ? [{ t, c }] : [];
  });
  const total = chosen.reduce((s, x) => s + x.c, 0);
  const pixC = cents(row.value);
  const leftover = pixC - total;
  const overTitle = chosen.find((x) => x.c > cents(x.t.value));
  const error = !customerId ? 'Escolha o cliente.' : leftover < 0 ? 'A soma passa do valor do Pix.' : overTitle ? `Passa do saldo do pedido #${overTitle.t.orderNumero}.` : total === 0 && leftover === 0 ? 'Nada a baixar.' : null;

  async function submit() {
    if (error || !customerId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pix/${row.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, allocations: chosen.map((x) => ({ transactionId: x.t.transactionId, amount: x.c / 100 })) }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível dar baixa.'));
      const json = await res.json();
      const r = (json.data ?? json) as { settled: number; partial: number; creditCreated: number; boletosWrittenOff: number; warnings: string[] };
      const parts = [
        r.settled ? `${r.settled} título(s) quitado(s)` : '',
        r.partial ? `${r.partial} baixa(s) parcial(is)` : '',
        r.creditCreated ? `${brl(r.creditCreated)} guardado(s) como crédito` : '',
        r.boletosWrittenOff ? `${r.boletosWrittenOff} boleto(s) cancelado(s) no banco` : '',
      ].filter(Boolean);
      toast(parts.join(' · ') || 'Pix conciliado.', 'success');
      for (const w of r.warnings) toast(w, 'info');
      await onDone();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao dar baixa.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const filtered = customers.filter((c) => c.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-stone-900">Baixar Pix de {brl(row.value)}</h3>
            <p className="text-xs text-stone-500">{row.payerName ?? 'Pagador não identificado'} · {br(row.date)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-bold text-stone-600">Cliente</label>
            {customerId ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
                <span className="font-bold text-stone-900">{customers.find((c) => c.id === customerId)?.label ?? '—'}</span>
                <button className="text-xs font-bold text-amber-700 hover:underline" onClick={() => { setCustomerId(null); setValues({}); }}>
                  Trocar
                </button>
              </div>
            ) : (
              <div className="mt-1">
                <input className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="Buscar cliente com valor em aberto…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                <ul className="mt-2 max-h-52 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
                  {filtered.length === 0 && <li className="p-3 text-xs text-stone-500">Nenhum cliente com título em aberto.</li>}
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-amber-50" onClick={() => pickCustomer(c.id)}>
                        <span className="font-semibold text-stone-800">{c.label}</span>
                        <span className="text-xs text-stone-500">{c.count} título(s) · {brl(c.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {customerId && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-600">Quanto vai para cada pedido</span>
                <button className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline" onClick={() => auto()}>
                  <Wand2 className="h-3.5 w-3.5" /> Distribuir (mais antigo primeiro)
                </button>
              </div>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {titles.map((t) => (
                  <li key={t.transactionId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="min-w-[10rem] flex-1 text-sm">
                      <span className="font-bold text-stone-900">#{t.orderNumero}</span>
                      <span className="ml-2 text-xs text-stone-500">{t.dueDate ? `venc. ${br(t.dueDate)}` : 'sem vencimento'} · saldo {brl(t.value)}</span>
                    </div>
                    <button className="text-[11px] font-bold text-stone-500 hover:text-amber-700" onClick={() => setValues((v) => ({ ...v, [t.transactionId]: fmt(Math.min(cents(t.value), Math.max(0, pixC - (total - cents(parseMoney(v[t.transactionId] ?? '')))))) }))}>
                      máx
                    </button>
                    <input
                      inputMode="decimal"
                      className="w-28 rounded-lg border border-stone-300 px-2 py-1.5 text-right text-sm"
                      placeholder="0,00"
                      value={values[t.transactionId] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [t.transactionId]: e.target.value }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-stone-50 p-3 text-sm">
            <div className="flex justify-between"><span className="text-stone-500">Pix</span><strong>{brl(pixC / 100)}</strong></div>
            <div className="flex justify-between"><span className="text-stone-500">Baixando</span><strong>{brl(total / 100)}</strong></div>
            <div className="flex justify-between">
              <span className="text-stone-500">{leftover >= 0 ? 'Sobra (fica como crédito do cliente)' : 'Passou'}</span>
              <strong className={leftover < 0 ? 'text-red-600' : leftover > 0 ? 'text-sky-700' : 'text-emerald-700'}>{brl(Math.abs(leftover) / 100)}</strong>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">Valor menor que o pedido = baixa parcial: o saldo continua em aberto na cobrança.</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            {error && customerId && <span className="mr-auto text-xs font-semibold text-red-600">{error}</span>}
            <button className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50" onClick={onClose}>
              Cancelar
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={!!error || saving} onClick={() => void submit()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar baixa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
