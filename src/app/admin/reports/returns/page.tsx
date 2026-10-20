'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';
import type { ReturnsReport } from '@/server/services/returns';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-stone-900">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

export default function ReturnsReportPage() {
  const [data, setData] = useState<ReturnsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/reports/returns');
        const json = await res.json();
        if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar.'));
        setData((json.data ?? json) as ReturnsReport);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, []);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data)
    return (
      <div className="flex h-60 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );

  const c = data.current;
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-6 w-6 text-rose-600" />
        <div>
          <h1 className="text-xl font-black text-stone-900">Trocas e devoluções</h1>
          <p className="text-xs text-stone-500">Lance pelo botão ↺ na lista de pedidos. Troca = repomos o produto; devolução = vira crédito do cliente.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Trocas em ${monthLabel(c.month)}`} value={String(c.trocas)} />
        <Kpi label="Devoluções no mês" value={String(c.devolucoes)} />
        <Kpi label="Unidades no mês" value={c.units.toLocaleString('pt-BR')} />
        <Kpi label="Prejuízo estimado no mês" value={brl(c.lossValue)} sub="custo perdido + valor devolvido" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-800">Clientes (mês atual)</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.byCustomer.length === 0 && <li className="p-4 text-stone-400">Nada neste mês.</li>}
            {data.byCustomer.map((x) => (
              <li key={x.customerId} className="flex items-center justify-between px-4 py-2">
                <span className="font-semibold text-stone-800">{x.customerName}</span>
                <span className="text-xs text-stone-500">{x.units} un · {x.count}× · {brl(x.lossValue)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-800">Produtos (mês atual)</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.byProduct.length === 0 && <li className="p-4 text-stone-400">Nada neste mês.</li>}
            {data.byProduct.map((x) => (
              <li key={x.name} className="flex items-center justify-between px-4 py-2">
                <span className="font-semibold text-stone-800">{x.name}</span>
                <span className="text-xs text-stone-500">{x.units} un · {x.count}×</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-800">Motivos (mês atual)</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.byReason.length === 0 && <li className="p-4 text-stone-400">Nada neste mês.</li>}
            {data.byReason.map((x) => (
              <li key={x.reason} className="flex items-center justify-between px-4 py-2">
                <span className="text-stone-800">{x.reason}</span>
                <span className="text-xs font-bold text-stone-500">{x.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-800">Mês a mês</h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase text-stone-500">
            <tr><th className="px-4 py-2">Mês</th><th className="px-3 py-2 text-right">Trocas</th><th className="px-3 py-2 text-right">Devoluções</th><th className="px-3 py-2 text-right">Unidades</th><th className="px-3 py-2 text-right">Prejuízo est.</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.months.map((m) => (
              <tr key={m.month}><td className="px-4 py-2 capitalize">{monthLabel(m.month)}</td><td className="px-3 py-2 text-right">{m.trocas}</td><td className="px-3 py-2 text-right">{m.devolucoes}</td><td className="px-3 py-2 text-right">{m.units}</td><td className="px-3 py-2 text-right font-bold">{brl(m.lossValue)}</td></tr>
            ))}
            {data.months.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-400">Nenhuma troca ou devolução lançada ainda.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-black text-stone-800">Últimos lançamentos</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {data.latest.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-stone-500">{br(r.date)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.kind === 'troca' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'}`}>{r.kind === 'troca' ? 'Troca' : 'Devolução'}</span></td>
                <td className="px-3 py-2 font-semibold text-stone-800">{r.customerName} <span className="font-normal text-stone-400">#{r.orderNumero}</span></td>
                <td className="px-3 py-2 text-stone-700">{r.units} × {r.baseName}</td>
                <td className="px-3 py-2 text-xs text-stone-500">{r.reason ?? ''}</td>
                <td className="px-3 py-2 text-right font-bold">{brl(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
