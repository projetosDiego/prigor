'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { SellerProjectionReport, SellerProjectionRow } from '@/server/services/seller-projection';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function GoalBar({ value }: { value: number }) {
  const w = Math.min(100, Math.max(0, value));
  const tone = value >= 100 ? 'bg-emerald-500' : value >= 80 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full ${tone}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-bold text-stone-700">{value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
    </div>
  );
}

function Kpi({ label, value, sub, tone = 'text-stone-900' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function ProjectionRow({ r, strong }: { r: SellerProjectionRow; strong?: boolean }) {
  return (
  <tr className={strong ? 'bg-stone-50 font-black' : 'hover:bg-stone-50'}>
    <td className="px-4 py-2.5 font-semibold text-stone-900">{r.name}</td>
    <td className="px-3 py-2.5 text-right">
      {brl(r.realized)}
      <div className="text-[10px] font-normal text-stone-400">{r.orders} pedido(s) · ticket {brl(r.averageTicket)}</div>
    </td>
    <td className="px-3 py-2.5 text-right text-xs text-stone-600">
      {brl(r.paceMonth)}/dia
      <div className={`text-[10px] ${r.paceRecent >= r.paceMonth ? 'text-emerald-600' : 'text-red-500'}`}>recente {brl(r.paceRecent)}/dia</div>
    </td>
    <td className="px-3 py-2.5 text-right font-black text-stone-900">
      {brl(r.projectionMonth)}
      <div className="text-[10px] font-normal text-stone-400">recente {brl(r.projectionRecent)}</div>
    </td>
    <td className="px-3 py-2.5 text-right text-xs">
      {r.goal > 0 ? (
        <>
          <div className="text-stone-600">{brl(r.goal)}</div>
          <GoalBar value={r.projectedPctGoal} />
        </>
      ) : (
        <span className="text-stone-400">sem meta</span>
      )}
    </td>
    <td className="px-3 py-2.5 text-right text-xs text-stone-600">
      {r.goal > 0 ? (r.missing > 0 ? (<>{brl(r.missing)}<div className="text-[10px] text-stone-400">{brl(r.neededPerDay)}/dia</div></>) : <span className="font-bold text-emerald-600">meta batida</span>) : '—'}
    </td>
    <td className="px-3 py-2.5 text-right text-xs text-stone-600">
      {brl2(r.commissionProjected)}
      <div className="text-[10px] text-stone-400">já {brl2(r.commissionRealized)}</div>
    </td>
    <td className="px-3 py-2.5 text-right text-xs">
      <span className="font-semibold text-stone-800">{brl(r.receivable.total)}</span>
      <div className="text-[10px]">
        <span className="text-red-600">{brl(r.receivable.overdue)} atrasado</span> · <span className="text-stone-500">{brl(r.receivable.next30)} em 30d</span>
      </div>
    </td>
    <td className={`px-3 py-2.5 text-right text-xs font-bold ${r.projectedVsPrevPct !== null && r.projectedVsPrevPct < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
      {pct(r.projectedVsPrevPct)}
      <div className="text-[10px] font-normal text-stone-400">mês ant. {brl(r.prevMonthRealized)}</div>
    </td>
  </tr>
);
}

export default function SellerProjectionPage() {
  const [data, setData] = useState<SellerProjectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/reports/seller-projection');
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar a projeção.'));
      setData((json.data ?? json) as SellerProjectionReport);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-stone-500">
        {error ? <span className="text-red-600">{error}</span> : (<><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando projeção…</>)}
      </div>
    );
  }

  const t = data.total;
  const [yy, mm] = data.month.split('-');
  const monthLabel = new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hasGoal = t.goal > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-12 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black text-stone-900">
          <TrendingUp className="h-6 w-6 text-amber-600" /> Projeção por vendedor
        </h1>
        <p className="text-sm text-stone-500">
          {monthLabel} · dia {t.daysElapsed} de {data.daysInMonth}. Projeção = realizado + ritmo diário × dias restantes. O ritmo recente usa os últimos 14 dias.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Realizado no mês" value={brl(t.realized)} sub={`${t.orders} pedido(s)`} />
        <Kpi label="Projeção (ritmo do mês)" value={brl(t.projectionMonth)} sub={`recente: ${brl(t.projectionRecent)}`} />
        <Kpi
          label="Meta da equipe"
          value={hasGoal ? brl(t.goal) : '—'}
          sub={hasGoal ? `projeção ${t.projectedPctGoal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% da meta` : 'defina a meta em Vendedores'}
          tone={hasGoal && t.projectedPctGoal < 80 ? 'text-red-600' : 'text-stone-900'}
        />
        <Kpi label="A receber (vendedores)" value={brl(t.receivable.total)} sub={`${brl(t.receivable.overdue)} em atraso`} tone="text-stone-900" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Vendedor</th>
              <th className="px-3 py-2 text-right">Realizado</th>
              <th className="px-3 py-2 text-right">Ritmo</th>
              <th className="px-3 py-2 text-right">Projeção do mês</th>
              <th className="px-3 py-2 text-right">Meta × projeção</th>
              <th className="px-3 py-2 text-right">Falta p/ meta</th>
              <th className="px-3 py-2 text-right">Comissão proj.</th>
              <th className="px-3 py-2 text-right">A receber</th>
              <th className="px-3 py-2 text-right">vs mês anterior</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((r) => (
              <ProjectionRow key={r.sellerId ?? 'none'} r={r} />
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-stone-400">Nenhum vendedor ativo.</td>
              </tr>
            )}
            <ProjectionRow r={t} strong />
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-stone-400">
        &quot;vs mês anterior&quot; compara a projeção com o total do mês passado inteiro. Pedidos cancelados não entram. Comissão projetada mantém a proporção da comissão já registrada nos pedidos.
      </p>
    </div>
  );
}
