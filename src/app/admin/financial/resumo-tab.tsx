'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import type { FinanceSummary } from '@/server/services/finance';
import { api, brl, brl0, Kpi, monthLabel, shortMonth } from './fin-ui';
import type { TabKey } from './page';

function shift(month: string, k: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7);
}

function Row({ label, value, bold, tone, sign }: { label: string; value: number; bold?: boolean; tone?: string; sign?: '−' | '=' }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? 'border-t border-stone-200 font-black' : ''}`}>
      <span className="text-stone-600">{sign ? `${sign} ` : ''}{label}</span>
      <span className={tone ?? 'text-stone-900'}>{brl(value)}</span>
    </div>
  );
}

export function ResumoTab({ version, goto }: { version: number; goto: (t: TabKey) => void }) {
  const { toast } = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<FinanceSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await api<FinanceSummary>(`/api/finance/summary${month ? `?month=${month}` : ''}`);
        if (alive) {
          setData(d);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Erro ao carregar o resumo.', 'error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [month, version, toast]);

  if (!data)
    return (
      <div className="flex h-48 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );

  const isCurrent = data.month === data.today.slice(0, 7);
  const maxBar = Math.max(1, ...data.series.flatMap((s) => [s.in, s.out]));
  const maxCat = Math.max(1, ...data.expensesByCategory.map((c) => c.value));
  const r = data.result;
  const diffIn = data.cash.prevIn > 0 ? Math.round(((data.cash.in - data.cash.prevIn) / data.cash.prevIn) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button className="rounded-lg border border-stone-300 p-2 hover:bg-stone-50" onClick={() => setMonth(shift(data.month, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-[10rem] text-center text-sm font-black capitalize text-stone-900">{monthLabel(data.month)}</div>
        <button className="rounded-lg border border-stone-300 p-2 hover:bg-stone-50 disabled:opacity-40" disabled={isCurrent} onClick={() => setMonth(shift(data.month, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {isCurrent && (data.open.payableOverdue > 0 || data.open.payableNext7 > 0) && (
        <button onClick={() => goto('pagar')} className="flex w-full items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left hover:bg-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-950">
            {data.open.payableOverdue > 0 && <div className="font-black text-red-700">Você tem {brl(data.open.payableOverdue)} em contas vencidas.</div>}
            {data.open.payableNext7 > 0 && <div><strong>{data.open.payableNext7Count}</strong> conta(s) vencem nos próximos 7 dias, somando <strong>{brl(data.open.payableNext7)}</strong>.</div>}
            <div className="text-xs text-amber-800">Clique para abrir Contas a pagar.</div>
          </div>
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Saldo nas contas" value={data.totalBalance === null ? '—' : brl0(data.totalBalance)} sub={data.totalBalance === null ? 'Cadastre suas contas na aba Cadastros' : `${data.accounts.filter((a) => a.active).length} conta(s)`} tone={data.totalBalance !== null && data.totalBalance < 0 ? 'text-red-600' : 'text-stone-900'} onClick={() => goto('cadastros')} />
        <Kpi label="Entrou no mês" value={brl0(data.cash.in)} sub={diffIn === null ? undefined : `${diffIn >= 0 ? '+' : ''}${diffIn}% vs mês anterior`} tone="text-emerald-700" />
        <Kpi label="Saiu no mês" value={brl0(data.cash.out)} sub={data.cash.prevOut > 0 ? `mês anterior: ${brl0(data.cash.prevOut)}` : undefined} tone="text-red-600" />
        <Kpi label="Lucro do mês" value={brl0(r.netProfit)} sub={r.marginPct === null ? 'sem vendas no mês' : `${r.marginPct.toLocaleString('pt-BR')}% da receita`} tone={r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="A receber" value={brl0(data.open.receivable)} sub={data.open.receivableOverdue > 0 ? `${brl0(data.open.receivableOverdue)} vencido` : 'nada vencido'} tone="text-emerald-800" onClick={() => goto('receber')} />
        <Kpi label="A pagar" value={brl0(data.open.payable)} sub={data.open.payableOverdue > 0 ? `${brl0(data.open.payableOverdue)} vencido` : 'nada vencido'} tone="text-red-700" onClick={() => goto('pagar')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-stone-800">Entradas e saídas (6 meses)</h3>
          <div className="flex h-44 items-end gap-3">
            {data.series.map((s) => (
              <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-36 w-full items-end justify-center gap-1">
                  <div className="w-1/2 max-w-[22px] rounded-t bg-emerald-500" style={{ height: `${(s.in / maxBar) * 100}%` }} title={`Entrou ${brl(s.in)}`} />
                  <div className="w-1/2 max-w-[22px] rounded-t bg-red-400" style={{ height: `${(s.out / maxBar) * 100}%` }} title={`Saiu ${brl(s.out)}`} />
                </div>
                <span className={`text-[11px] capitalize ${s.month === data.month ? 'font-black text-stone-900' : 'text-stone-500'}`}>{shortMonth(s.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-stone-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Entrou</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />Saiu</span>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-black text-stone-800">Resultado de {monthLabel(data.month)}</h3>
          <p className="mb-2 text-[11px] text-stone-500">Pelos pedidos do mês ({r.orders}), não pelo dia que o dinheiro entrou.</p>
          <Row label="Vendas (já com desconto)" value={r.revenue} />
          <Row label="Custo dos produtos vendidos" value={r.cogs} sign="−" />
          <Row label="Comissões" value={r.commissions} sign="−" />
          <Row label="Lucro bruto" value={r.grossProfit} bold sign="=" tone={r.grossProfit >= 0 ? 'text-stone-900' : 'text-red-600'} />
          <Row label="Despesas do mês (aluguel, contas, etc.)" value={r.operating} sign="−" />
          <Row label="Lucro do mês" value={r.netProfit} bold sign="=" tone={r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'} />
          <p className="mt-2 text-[11px] text-stone-400">Compras de ingredientes/embalagens não entram aqui: já estão no custo dos produtos. Equipamentos também ficam de fora.</p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-stone-800">Para onde foi o dinheiro (pago no mês)</h3>
          {data.expensesByCategory.length === 0 ? (
            <p className="text-sm text-stone-400">Nenhuma despesa paga neste mês.</p>
          ) : (
            <ul className="space-y-2">
              {data.expensesByCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between text-xs"><span className="font-semibold text-stone-700">{c.category}</span><span className="text-stone-600">{brl(c.value)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-amber-500" style={{ width: `${(c.value / maxCat) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-stone-800">Contas</h3>
          {data.accounts.length === 0 ? (
            <div className="text-sm text-stone-500">
              Nenhuma conta cadastrada. Cadastre seus bancos e o caixa em dinheiro para ver o saldo e o fluxo de caixa.
              <button className="ml-1 font-bold text-amber-700 hover:underline" onClick={() => goto('cadastros')}>Cadastrar agora</button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {data.accounts.filter((a) => a.active).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="font-semibold text-stone-800">{a.name}{a.isDefault && <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500">padrão</span>}</span>
                  <span className={`font-black ${a.balance < 0 ? 'text-red-600' : 'text-stone-900'}`}>{brl(a.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
