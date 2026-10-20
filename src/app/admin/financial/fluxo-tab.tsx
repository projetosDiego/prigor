'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import type { CashflowDTO } from '@/server/services/finance';
import { api, brl, btnGhost } from './fin-ui';
import type { TabKey } from './page';

export function FluxoTab({ version, goto }: { version: number; goto: (t: TabKey) => void }) {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState<CashflowDTO | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const d = await api<CashflowDTO>(`/api/finance/cashflow?weeks=${weeks}`);
        if (alive) setData(d);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Erro ao carregar o fluxo.', 'error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [weeks, version, toast]);

  if (!data)
    return (
      <div className="flex h-48 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );

  const c = (v: number) => v / 100;
  const max = Math.max(1, ...data.buckets.map((b) => Math.abs(b.balanceCents)), Math.abs(data.startBalance ?? 0) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-stone-700">Próximas</span>
        {[4, 8, 12].map((w) => (
          <button key={w} onClick={() => setWeeks(w)} className={`rounded-full px-3 py-1 text-xs font-bold ${weeks === w ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{w} semanas</button>
        ))}
        <span className="ml-auto text-xs text-stone-500">Saldo de partida: <strong>{data.startBalance === null ? 'sem contas cadastradas (parte de zero)' : brl(data.startBalance)}</strong></span>
      </div>

      {data.startBalance === null && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Cadastre suas contas com o saldo de hoje para a projeção partir do dinheiro real.
          <button className="ml-1 font-bold underline" onClick={() => goto('cadastros')}>Ir para Cadastros</button>
        </div>
      )}

      {data.firstNegative ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="text-sm text-red-900">
            <div className="font-black">O saldo fica negativo em {data.firstNegative}.</div>
            <div>Menor saldo previsto: <strong>{brl(c(data.minBalanceCents))}</strong>. Cobre os clientes atrasados ou renegocie os vencimentos para evitar o buraco.</div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Pelo que está lançado, o caixa não fica negativo nas próximas {weeks} semanas (menor saldo: {brl(c(data.minBalanceCents))}).</div>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-black text-stone-800">Saldo previsto ao fim de cada período</h3>
        <div className="flex h-48 items-center gap-2">
          {data.buckets.map((b) => {
            const h = (Math.abs(b.balanceCents) / max) * 100;
            const neg = b.balanceCents < 0;
            return (
              <div key={b.key} className="flex h-full flex-1 flex-col" title={`${b.label}: ${brl(c(b.balanceCents))}`}>
                <div className="flex flex-1 items-end">{!neg && <div className="w-full rounded-t bg-emerald-500" style={{ height: `${h}%` }} />}</div>
                <div className="h-px bg-stone-300" />
                <div className="flex flex-1 items-start">{neg && <div className="w-full rounded-b bg-red-500" style={{ height: `${h}%` }} />}</div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Período</th>
              <th className="px-3 py-2 text-right">Entra</th>
              <th className="px-3 py-2 text-right">Sai</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="px-3 py-2 text-right text-stone-400">Se atrasados pagarem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.buckets.map((b) => (
              <tr key={b.key} className={b.key === 'overdue' ? 'bg-red-50/40' : ''}>
                <td className="px-4 py-2 font-semibold text-stone-800">{b.label}{b.key === 'overdue' && <div className="text-[11px] font-normal text-stone-500">receber atrasado não conta no saldo</div>}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{brl(c(b.inCents))}</td>
                <td className="px-3 py-2 text-right text-red-600">{brl(c(b.outCents))}</td>
                <td className={`px-3 py-2 text-right font-black ${b.balanceCents < 0 ? 'text-red-600' : 'text-stone-900'}`}>{brl(c(b.balanceCents))}</td>
                <td className="px-3 py-2 text-right text-stone-400">{brl(c(b.optimisticCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(data.laterInCents > 0 || data.laterOutCents > 0) && (
        <p className="text-xs text-stone-500">Depois do período: {brl(c(data.laterInCents))} a receber e {brl(c(data.laterOutCents))} a pagar.</p>
      )}
      <button className={btnGhost} onClick={() => goto('pagar')}>Ver contas a pagar</button>
    </div>
  );
}
