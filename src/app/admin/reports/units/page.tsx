'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Layers, Loader2 } from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { UnitsReport } from '@/server/services/units-report';

const int = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const chip = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function UnitsReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [data, setData] = useState<UnitsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/reports/units?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar o relatório.'));
      setData((json.data ?? json) as UnitsReport);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const highlights = useMemo(() => {
    if (!data) return [];
    const brownies = data.rows.filter((r) => /7x5|5x5/i.test(r.name));
    return (brownies.length > 0 ? brownies : data.rows).slice(0, 3);
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const head = ['Produto', 'Direto', 'Via displays/kits', 'Total'].join(';');
    const body = data.rows.map((r) => [`"${r.name.replace(/"/g, '""')}"`, r.direct, r.viaKits, r.total].join(';')).join('\n');
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unidades-vendidas-${from || 'inicio'}-${to || 'hoje'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function preset(kind: 'mes' | 'mesPassado' | '90' | 'tudo') {
    const d = new Date();
    if (kind === 'mes') {
      setFrom(iso(new Date(d.getFullYear(), d.getMonth(), 1)));
      setTo(iso(d));
    } else if (kind === 'mesPassado') {
      setFrom(iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setTo(iso(new Date(d.getFullYear(), d.getMonth(), 0)));
    } else if (kind === '90') {
      const p = new Date();
      p.setDate(p.getDate() - 90);
      setFrom(iso(p));
      setTo(iso(d));
    } else {
      setFrom('');
      setTo('');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-stone-900">
            <Layers className="h-6 w-6 text-amber-600" /> Unidades vendidas
          </h1>
          <p className="text-sm text-stone-500">
            Displays e kits entram multiplicados pela composição (ex.: display com 12 = 12 × Brownie 7x5). Configure em Cadastro de Produtos → editar → Composição.
          </p>
        </div>
        <button className={`${chip} inline-flex items-center gap-1.5`} onClick={exportCsv} disabled={!data}>
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <input type="date" className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-stone-400">até</span>
        <input type="date" className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={chip} onClick={() => preset('mes')}>Este mês</button>
          <button className={chip} onClick={() => preset('mesPassado')}>Mês passado</button>
          <button className={chip} onClick={() => preset('90')}>90 dias</button>
          <button className={chip} onClick={() => preset('tudo')}>Tudo</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading || !data ? (
        <div className="flex h-40 items-center justify-center text-stone-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {highlights.map((r) => (
              <div key={r.productId} className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="truncate text-xs font-bold uppercase tracking-wide text-stone-500">{r.name}</div>
                <div className="mt-1 text-3xl font-black text-stone-900">{int(r.total)}</div>
                <div className="text-xs text-stone-500">
                  {int(r.direct)} direto · {int(r.viaKits)} em displays/kits
                </div>
              </div>
            ))}
            {highlights.length === 0 && <div className="col-span-full rounded-xl border border-dashed p-6 text-center text-stone-400">Sem vendas no período.</div>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Produto (unidade-base)</th>
                  <th className="px-3 py-2 text-right">Vendido direto</th>
                  <th className="px-3 py-2 text-right">Via displays/kits</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.rows.map((r) => (
                  <tr key={r.productId}>
                    <td className="px-4 py-2 font-semibold text-stone-900">{r.name}</td>
                    <td className="px-3 py-2 text-right text-stone-600">{int(r.direct)}</td>
                    <td className="px-3 py-2 text-right text-stone-600">{int(r.viaKits)}</td>
                    <td className="px-3 py-2 text-right font-black text-stone-900">{int(r.total)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-stone-400">Nenhuma venda no período.</td>
                  </tr>
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="bg-stone-50 text-sm font-black text-stone-900">
                  <tr>
                    <td className="px-4 py-2" colSpan={3}>Total de unidades</td>
                    <td className="px-3 py-2 text-right">{int(data.totalUnits)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {data.kits.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-200 px-4 py-3 text-sm font-black uppercase tracking-wide text-stone-700">Displays e kits vendidos</div>
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Kit</th>
                    <th className="px-3 py-2 text-right">Qtd vendida</th>
                    <th className="px-3 py-2 text-right">Faturamento</th>
                    <th className="px-3 py-2">Equivale a</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.kits.map((k) => (
                    <tr key={k.productId}>
                      <td className="px-4 py-2 font-semibold text-stone-900">{k.name}</td>
                      <td className="px-3 py-2 text-right">{int(k.quantity)}</td>
                      <td className="px-3 py-2 text-right">{brl(k.revenue)}</td>
                      <td className="px-3 py-2 text-stone-600">{k.components.map((c) => `${int(c.units)} × ${c.name}`).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
