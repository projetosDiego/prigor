'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Loader2, Package, Plus } from 'lucide-react';

import { errorMessage } from '@/lib/errors';
import { api, Field, inputCls, Modal, Toggle } from './parts';

export interface Prize {
  id: string;
  code: string;
  title: string;
  description: string | null;
  bonusUnits: number;
  drawWeight: number;
  oddsPct: number;
  pointsCost: number | null;
  stockPerPoint: number | null;
  requiresCheck: boolean;
  validDays: number | null;
  active: boolean;
  sortOrder: number;
  timesWon: number;
}

export default function PrizesTab() {
  const [rows, setRows] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Prize | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api<{ data: Prize[] }>('/api/clube/premios')).data);
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-500 max-w-xl">
          A <b>chance</b> de cada prêmio no cadastro é o peso dele dividido pela soma dos pesos. Brindes com estoque por ponto só entram no
          sorteio enquanto o ponto tiver unidade livre.
        </p>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-4 w-4" /> Novo prêmio
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-500 uppercase text-[10px]">
            <tr>
              <th className="text-left px-4 py-2">Prêmio</th>
              <th className="text-right px-4 py-2">Peso</th>
              <th className="text-right px-4 py-2">Chance</th>
              <th className="text-right px-4 py-2">Troca (pts)</th>
              <th className="text-right px-4 py-2">Estoque/ponto</th>
              <th className="text-right px-4 py-2">Repor ao ponto</th>
              <th className="text-right px-4 py-2">Saíram</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`border-t border-stone-100 ${p.active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-2.5">
                  <p className="font-bold text-stone-800 flex items-center gap-1.5">
                    {p.stockPerPoint !== null && <Package className="h-3.5 w-3.5 text-amber-700" />}
                    {p.title}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    {p.requiresCheck ? 'Conferir no balcão · ' : ''}
                    {p.validDays ? `Retirar em ${p.validDays} dias · ` : ''}
                    {p.active ? 'Ativo' : 'Inativo'}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right">{p.drawWeight}</td>
                <td className="px-4 py-2.5 text-right font-black">{p.drawWeight > 0 && p.active ? fmtPct(p.oddsPct) : '—'}</td>
                <td className="px-4 py-2.5 text-right">{p.pointsCost ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">{p.stockPerPoint ?? 'Sem limite'}</td>
                <td className="px-4 py-2.5 text-right">{p.bonusUnits > 0 ? `${p.bonusUnits} brownie` : '—'}</td>
                <td className="px-4 py-2.5 text-right">{p.timesWon}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setEditing(p)} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100">
                    <Edit2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <Loader2 className="m-4 h-4 w-4 animate-spin text-stone-400" />}
      </div>

      {editing && (
        <PrizeForm
          prize={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function PrizeForm({ prize, onClose, onSaved }: { prize: Prize | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [f, setF] = useState({
    title: prize?.title ?? '',
    description: prize?.description ?? '',
    bonusUnits: String(prize?.bonusUnits ?? 0),
    drawWeight: String(prize?.drawWeight ?? 0),
    pointsCost: prize?.pointsCost != null ? String(prize.pointsCost) : '',
    stockPerPoint: prize?.stockPerPoint != null ? String(prize.stockPerPoint) : '',
    requiresCheck: prize?.requiresCheck ?? false,
    validDays: prize?.validDays != null ? String(prize.validDays) : '',
    active: prize?.active ?? true,
    sortOrder: String(prize?.sortOrder ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(prize ? `/api/clube/premios/${prize.id}` : '/api/clube/premios', {
        method: prize ? 'PUT' : 'POST',
        body: { ...f, bonusUnits: Number(f.bonusUnits.replace(',', '.')) || 0, drawWeight: Number(f.drawWeight) || 0 },
      });
      await onSaved();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={prize ? `Editar — ${prize.title}` : 'Novo prêmio'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Nome que o cliente vê">
          <input value={f.title} onChange={(e) => set('title', e.target.value)} required className={inputCls} />
        </Field>
        <Field label="Descrição (opcional)">
          <input value={f.description} onChange={(e) => set('description', e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso no sorteio" hint="0 = não sorteia">
            <input value={f.drawWeight} onChange={(e) => set('drawWeight', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Custo em pontos" hint="vazio = não aparece na troca">
            <input value={f.pointsCost} onChange={(e) => set('pointsCost', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Estoque por ponto" hint="vazio = sem limite (ex.: 10 bolsas)">
            <input value={f.stockPerPoint} onChange={(e) => set('stockPerPoint', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Brownies a repor ao ponto" hint="1 para cupons de brownie; 0 para brindes">
            <input value={f.bonusUnits} onChange={(e) => set('bonusUnits', e.target.value)} inputMode="decimal" className={inputCls} />
          </Field>
          <Field label="Prazo para retirar (dias)" hint="vazio = sem prazo">
            <input value={f.validDays} onChange={(e) => set('validDays', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Ordem">
            <input value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <Toggle checked={f.requiresCheck} onChange={(v) => set('requiresCheck', v)} label='Pedir "confira no balcão"' />
          <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Ativo" />
        </div>
        <button disabled={saving} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </form>
    </Modal>
  );
}
