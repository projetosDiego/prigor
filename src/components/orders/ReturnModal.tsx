'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { OrderReturnsDTO } from '@/server/services/returns';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const REASONS = ['Amassado / quebrado', 'Vencido / passou do ponto', 'Produto errado', 'Cliente não vendeu', 'Outro'];

export default function ReturnModal({ orderId, numero, onClose, onChanged }: { orderId: string; numero: number; onClose: () => void; onChanged?: () => void }) {
  const { toast, confirm } = useToast();
  const [data, setData] = useState<OrderReturnsDTO | null>(null);
  const [itemId, setItemId] = useState('');
  const [units, setUnits] = useState('1');
  const [kind, setKind] = useState<'troca' | 'devolucao'>('troca');
  const [reason, setReason] = useState(REASONS[0]!);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}/returns`);
    if (!res.ok) {
      toast(await responseErrorMessage(res, 'Não foi possível carregar.'), 'error');
      return;
    }
    const json = await res.json();
    const d = (json.data ?? json) as OrderReturnsDTO;
    setData(d);
    setItemId((cur) => cur || d.items.find((i) => i.remainingUnits > 0)?.itemId || d.items[0]?.itemId || '');
  }, [orderId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const item = data?.items.find((i) => i.itemId === itemId);
  const n = Number(units.replace(',', '.'));
  const value = item && n > 0 ? Math.round(n * item.unitValue * 100) / 100 : 0;

  async function save() {
    if (!item || !(n > 0)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, units: n, kind, reason }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível registrar.'));
      const json = await res.json();
      const r = (json.data ?? json) as { creditCreated: number };
      toast(kind === 'devolucao' ? `Devolução registrada · ${brl(r.creditCreated)} de crédito para o cliente.` : 'Troca registrada.', 'success');
      setUnits('1');
      await load();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao registrar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({ title: 'Desfazer lançamento', message: 'Remover esta troca/devolução? O crédito gerado também é removido.', confirmLabel: 'Desfazer' });
    if (!ok) return;
    const res = await fetch(`/api/returns/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast(await responseErrorMessage(res, 'Não foi possível desfazer.'), 'error');
      return;
    }
    await load();
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="text-base font-black text-stone-900">Troca / devolução · pedido #{numero}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!data ? (
          <div className="flex h-32 items-center justify-center text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-stone-600 sm:col-span-2">
                Item
                <select className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  {data.items.map((i) => (
                    <option key={i.itemId} value={i.itemId} disabled={i.remainingUnits <= 0}>
                      {i.productName} — {i.quantity}x{i.unitsPerItem > 1 ? ` (${i.totalUnits} ${i.baseName})` : ''} · restam {i.remainingUnits}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-stone-600">
                Quantas unidades{item && item.unitsPerItem > 1 ? ` de ${item.baseName}` : ''}?
                <input inputMode="decimal" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal" value={units} onChange={(e) => setUnits(e.target.value)} />
              </label>
              <label className="text-xs font-bold text-stone-600">
                Motivo
                <select className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['troca', 'Troca', 'Repomos o produto. Não mexe no que o cliente deve; entra como perda.'],
                ['devolucao', 'Devolução', 'Gera crédito do valor para abater nas próximas cobranças.'],
              ] as const).map(([k, title, hint]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg border p-3 text-left ${kind === k ? 'border-amber-500 bg-amber-50' : 'border-stone-200 hover:bg-stone-50'}`}>
                  <div className="text-sm font-black text-stone-900">{title}</div>
                  <div className="text-[11px] text-stone-500">{hint}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-stone-50 p-3 text-sm">
              <span className="text-stone-500">Valor dessas unidades</span>
              <strong>{brl(value)}</strong>
            </div>
            <div className="flex justify-end">
              <button className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50" disabled={saving || !item || !(n > 0)} onClick={() => void save()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar
              </button>
            </div>

            {data.returns.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold text-stone-600">Já lançado neste pedido</div>
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
                  {data.returns.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1">
                        <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-black ${r.kind === 'troca' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'}`}>{r.kind === 'troca' ? 'Troca' : 'Devolução'}</span>
                        {r.units} × {r.baseName} · {brl(r.value)}
                        <div className="text-[11px] text-stone-400">{br(r.date)}{r.reason ? ` · ${r.reason}` : ''}</div>
                      </div>
                      <button className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={r.creditUsed} title={r.creditUsed ? 'Crédito já usado' : 'Desfazer'} onClick={() => void remove(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
