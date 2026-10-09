'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChefHat, Copy, Loader2, Printer, ShoppingBasket, AlertTriangle } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { ProductionPlanDTO } from '@/server/services/production';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dec = (v: number, max = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: max });
const inputCls =
  'rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';
const btn =
  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50';

/** AAAA-MM-DD no calendário local (toISOString devolveria o dia UTC). */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const br = (iso: string) => iso.split('-').reverse().join('/');
const unitShort = (u: string) => (u === 'gramas' ? 'g' : u === 'unidades' ? 'un' : u);

export default function ProductionPage() {
  const { toast } = useToast();
  const [from, setFrom] = useState(() => isoDay(1));
  const [to, setTo] = useState(() => isoDay(1));
  const [plan, setPlan] = useState<ProductionPlanDTO | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/production?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível montar o plano.'));
      setPlan((await res.json()) as ProductionPlanDTO);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar.', 'error');
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function preset(start: number, end: number) {
    setFrom(isoDay(start));
    setTo(isoDay(end));
  }

  function asText(p: ProductionPlanDTO): string {
    const period = p.from === p.to ? br(p.from) : `${br(p.from)} a ${br(p.to)}`;
    const lines = [`*Produção ${period}* (${p.orders} pedido${p.orders === 1 ? '' : 's'})`, ''];
    lines.push('*Fazer:*');
    for (const i of p.items) lines.push(`• ${dec(i.units, 2)} × ${i.name}`);
    if (p.preparations.length) {
      lines.push('', '*Preparos:*');
      for (const x of p.preparations) lines.push(`• ${x.name}: ${dec(x.units, 0)} ${unitShort(x.yieldUnit)} (${dec(x.batches, 2)} lote)`);
    }
    if (p.ingredients.length) {
      lines.push('', '*Compras / separação:*');
      for (const i of p.ingredients) lines.push(`• ${i.name}: ${dec(i.quantity, 0)} ${unitShort(i.unit)} → ${i.packages} emb. de ${dec(i.purchaseQty, 0)}`);
    }
    return lines.join('\n');
  }

  async function copy() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(asText(plan));
      toast('Lista copiada. Cole no WhatsApp.', 'success');
    } catch {
      toast('Não foi possível copiar automaticamente.', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-stone-900">
            <ChefHat className="h-6 w-6 text-amber-600" /> Produção & Compras
          </h1>
          <p className="text-sm text-stone-500">O que fazer e o que comprar para os pedidos com entrega no período, a partir das fichas técnicas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => preset(0, 0)}>Hoje</button>
          <button className={btn} onClick={() => preset(1, 1)}>Amanhã</button>
          <button className={btn} onClick={() => preset(0, 6)}>7 dias</button>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-stone-400">até</span>
          <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </header>

      {loading && !plan && (
        <div className="flex h-40 items-center justify-center text-stone-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calculando…
        </div>
      )}

      {plan && (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-sm text-stone-600">
              <strong>{plan.orders}</strong> pedido(s) · {plan.from === plan.to ? br(plan.from) : `${br(plan.from)} a ${br(plan.to)}`}
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </span>
            <button className={`${btn} ml-auto`} onClick={() => void copy()} disabled={plan.orders === 0}>
              <Copy className="h-4 w-4" /> Copiar p/ WhatsApp
            </button>
            <button className={btn} onClick={() => window.print()} disabled={plan.orders === 0}>
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>

          {plan.orders === 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-500">
              Nenhum pedido com entrega neste período (pedidos cancelados e já entregues não entram).
            </div>
          )}

          {plan.withoutSheet.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Sem ficha técnica em Produtos & Preços (não entram nas compras): <strong>{plan.withoutSheet.join(', ')}</strong>.
              </div>
            </div>
          )}
          {plan.warnings.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{plan.warnings.join(' · ')}</div>}

          {plan.orders > 0 && (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-xl border border-stone-200 bg-white">
                <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-black uppercase tracking-wide text-stone-700">Fazer ({plan.items.length} produtos)</h2>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {plan.items.map((i) => {
                      const batch = plan.products.find((p) => p.name === i.name);
                      return (
                        <tr key={i.productId}>
                          <td className="px-4 py-2 font-semibold text-stone-900">
                            {i.name}
                            <div className="text-[11px] font-normal text-stone-400">{i.orders} pedido(s)</div>
                          </td>
                          <td className="px-4 py-2 text-right text-lg font-black text-amber-700">{dec(i.units, 2)}</td>
                          <td className="px-4 py-2 text-right text-xs text-stone-500">{batch ? `${dec(batch.batches, 2)} lote(s)` : i.hasSheet ? '' : 'sem ficha'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {plan.preparations.length > 0 && (
                  <>
                    <h3 className="border-y border-stone-200 bg-stone-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-stone-500">Massas e recheios a preparar</h3>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-stone-100">
                        {plan.preparations.map((x) => (
                          <tr key={x.sheetId}>
                            <td className="px-4 py-2 font-semibold text-stone-900">{x.name}</td>
                            <td className="px-4 py-2 text-right font-bold">
                              {dec(x.units, 0)} {unitShort(x.yieldUnit)}
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-stone-500">{dec(x.batches, 2)} lote(s)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {plan.resources.length > 0 && (
                  <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
                    Tempo estimado: {plan.resources.map((r) => `${r.name} ${dec(r.minutes, 0)} min`).join(' · ')}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-stone-200 bg-white">
                <h2 className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 text-sm font-black uppercase tracking-wide text-stone-700">
                  <ShoppingBasket className="h-4 w-4 text-amber-600" /> Compras / separação
                  <span className="ml-auto text-xs font-bold normal-case text-stone-500">custo estimado {brl(plan.totalCost)}</span>
                </h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-2">Insumo</th>
                      <th className="px-4 py-2 text-right">Precisa</th>
                      <th className="px-4 py-2 text-right">Embalagens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {plan.ingredients.map((i) => (
                      <tr key={i.id}>
                        <td className="px-4 py-2 font-semibold text-stone-900">{i.name}</td>
                        <td className="px-4 py-2 text-right">
                          {dec(i.quantity, 0)} {unitShort(i.unit)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-stone-600">
                          <strong className="text-sm text-stone-900">{i.packages}</strong> × {dec(i.purchaseQty, 0)} {unitShort(i.unit)}
                        </td>
                      </tr>
                    ))}
                    {plan.ingredients.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-stone-400">
                          Sem insumos para calcular.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">Quantidades já incluem a perda de cada insumo. Estoque não é abatido.</p>
              </section>

              <section className="rounded-xl border border-stone-200 bg-white lg:col-span-2 print:hidden">
                <h2 className="border-b border-stone-200 px-4 py-3 text-sm font-black uppercase tracking-wide text-stone-700">Pedidos do período</h2>
                <div className="flex flex-wrap gap-2 p-4 text-xs">
                  {plan.orderList.map((o) => (
                    <span key={o.numero} className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                      #{o.numero} · {o.customer}
                      {o.deliveryDate && plan.from !== plan.to ? ` · ${br(o.deliveryDate).slice(0, 5)}` : ''}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
