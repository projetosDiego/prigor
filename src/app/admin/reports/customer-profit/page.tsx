'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { HeartCrack, Loader2 } from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';
import type { CustomerProfitReport } from '@/server/services/customer-profit';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const br = (iso: string) => iso.split('-').reverse().join('/');
const VERDICT = {
  nao_compensa: { label: 'Não compensa', cls: 'bg-red-100 text-red-800' },
  atencao: { label: 'Atenção', cls: 'bg-amber-100 text-amber-800' },
  ok: { label: 'Vale a pena', cls: 'bg-emerald-100 text-emerald-800' },
} as const;

type Filter = 'todos' | keyof typeof VERDICT;

export default function CustomerProfitPage() {
  const [days, setDays] = useState(90);
  const [filter, setFilter] = useState<Filter>('nao_compensa');
  const [data, setData] = useState<CustomerProfitReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setData(null);
    try {
      const res = await fetch(`/api/reports/customer-profit?days=${d}`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar.'));
      setData((json.data ?? json) as CustomerProfitReport);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  const rows = data ? data.rows.filter((r) => filter === 'todos' || r.verdict === filter) : [];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <HeartCrack className="h-6 w-6 text-red-600" />
        <div className="flex-1">
          <h1 className="text-xl font-black text-stone-900">Quais clientes compensam</h1>
          <p className="text-xs text-stone-500">Lucro = receita − devoluções − custo dos produtos − comissão − custo das trocas. Frete/entrega e ajuda de custo não entram.</p>
        </div>
        <select className="rounded-lg border border-stone-300 px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 60, 90, 180, 365].map((d) => (
            <option key={d} value={d}>Últimos {d} dias</option>
          ))}
        </select>
      </div>

      {!data ? (
        <div className="flex h-40 items-center justify-center text-stone-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calculando…</div>
      ) : (
        <>
          <div className="text-xs text-stone-500">{br(data.from)} a {br(data.to)} · {data.summary.customers} cliente(s) com pedido · lucro total {brl(data.summary.totalProfit)}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {([['nao_compensa', `Não compensa (${data.summary.naoCompensa})`], ['atencao', `Atenção (${data.summary.atencao})`], ['ok', `Vale a pena (${data.summary.ok})`], ['todos', 'Todos']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 font-bold ${filter === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{label}</button>
            ))}
          </div>
          {data.summary.naoCompensa > 0 && (
            <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">
              Os {data.summary.naoCompensa} clientes que não compensam somam {brl(data.summary.profitOfBad)} de resultado no período.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                  <th className="px-3 py-2 text-right">Trocas</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.customerId} className="align-top hover:bg-stone-50">
                    <td className="px-4 py-2 font-semibold text-stone-900">
                      {r.name}
                      {r.lastOrderDate && <div className="text-[11px] font-normal text-stone-400">último pedido {br(r.lastOrderDate)}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{r.orders}</td>
                    <td className="px-3 py-2 text-right">{brl(r.netRevenue)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.profit <= 0 ? 'text-red-600' : 'text-stone-900'}`}>{brl(r.profit)}</td>
                    <td className="px-3 py-2 text-right">{r.marginPct === null ? '—' : `${r.marginPct.toLocaleString('pt-BR')}%`}</td>
                    <td className="px-3 py-2 text-right">{r.returnRatePct ? `${r.returnRatePct.toLocaleString('pt-BR')}%` : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].label}</span>
                      {r.reasons.map((x) => (
                        <div key={x} className="text-[11px] text-stone-500">{x}</div>
                      ))}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-400">Nenhum cliente nesta faixa.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
