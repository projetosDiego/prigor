'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  Loader2, 
  Printer, 
  Download, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Users, 
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface OrderItemSummary {
  id: string;
  numero: number;
  orderDate: string;
  total: number;
  commissionVal: number;
  status: string;
}

interface CustomerSummary {
  customerId: string;
  customerName: string;
  total: number;
  commissionVal: number;
  ordersCount: number;
  orders: OrderItemSummary[];
}

interface Row {
  sellerId: string;
  sellerName: string;
  orders: number;
  realized: number;
  commission: number;
  goal: number;
  projection: number;
  pctGoal: number;
  customers: CustomerSummary[];
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  em_producao: 'Em Produção',
  entregue: 'Entregue',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
};

export default function SellerReportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSellerId, setExpandedSellerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/reports/sellers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao gerar o relatório.'));
      setRows((data.rows ?? []) as Row[]);
      setPeriod(data.period ?? null);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totRealized = rows.reduce((s, r) => s + r.realized, 0);
  const totCommission = rows.reduce((s, r) => s + (r.commission ?? 0), 0);
  const totGoal = rows.reduce((s, r) => s + r.goal, 0);
  const totProjection = rows.reduce((s, r) => s + r.projection, 0);
  const totPct = totGoal > 0 ? (totRealized / totGoal) * 100 : 0;

  const exportCsv = () => {
    const sep = ';';
    const head = ['Vendedor', 'Nº Pedidos', 'Realizado', 'Comissão', 'Meta', '% Meta', 'Projeção'].join(sep);
    const n = (v: number) => v.toFixed(2).replace('.', ',');
    const body = rows
      .map((r) => [
        `"${r.sellerName.replace(/"/g, '""')}"`,
        r.orders,
        n(r.realized),
        n(r.commission ?? 0),
        n(r.goal),
        r.pctGoal.toFixed(1).replace('.', ','),
        n(r.projection)
      ].join(sep))
      .join('\r\n');
    const totals = [
      'TOTAL',
      totOrders,
      n(totRealized),
      n(totCommission),
      n(totGoal),
      totPct.toFixed(1).replace('.', ','),
      n(totProjection)
    ].join(sep);
    const csv = `\uFEFF${head}\r\n${body}\r\n${totals}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-vendedores${from ? `-${from}` : ''}${to ? `-a-${to}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const toggleExpand = (sellerId: string) => {
    setExpandedSellerId((prev) => (prev === sellerId ? null : sellerId));
  };

  return (
    <div className="space-y-6">
      <style>{`@media print { body * { visibility: hidden !important; } .report-print, .report-print * { visibility: visible !important; } .report-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>

      <div className="flex justify-between items-center no-print">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-amber-700" />
            Relatório por Vendedor
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Vendas, comissões, meta e projeção por vendedor. Clique no vendedor para ver os clientes e pedidos.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold cursor-pointer">
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end no-print">
        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">A partir de</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Até</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50" />
          </div>
        </div>
        <button onClick={load} className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs py-2 cursor-pointer">Aplicar período</button>
      </div>

      {/* Cards de Resumo Rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Faturado</span>
          <p className="text-xl font-black text-stone-900 mt-1">{brl(totRealized)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">{totOrders} pedido{totOrders === 1 ? '' : 's'} no período</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Total em Comissões</span>
          <p className="text-xl font-black text-emerald-700 mt-1">{brl(totCommission)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Comissão dos vendedores</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Meta Total</span>
          <p className="text-xl font-black text-stone-900 mt-1">{totGoal > 0 ? brl(totGoal) : '—'}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">{totGoal > 0 ? `${totPct.toFixed(1)}% atingido` : 'Sem meta configurada'}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Projeção do Período</span>
          <p className="text-xl font-black text-amber-800 mt-1">{brl(totProjection)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Estimativa no ritmo atual</p>
        </div>
      </div>

      <div className="report-print rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black text-stone-900">Metas, comissões e vendas por vendedor</h3>
            {period && <p className="text-xs text-stone-500">Período: {period.from} a {period.to}</p>}
          </div>
          <span className="text-[11px] text-stone-400 italic no-print">Clique no vendedor para ver os clientes e pedidos</span>
        </div>
        {loading ? (
          <div className="flex h-60 items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
            <span className="text-xs text-stone-500 font-medium">Gerando...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 text-xs text-center">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">Vendedor</th>
                  <th className="py-3 px-6 text-center">Pedidos</th>
                  <th className="py-3 px-6 text-right">Realizado</th>
                  <th className="py-3 px-6 text-right text-emerald-700">Comissão</th>
                  <th className="py-3 px-6 text-right">Meta</th>
                  <th className="py-3 px-6 text-center">% Meta</th>
                  <th className="py-3 px-6 text-right">Projeção</th>
                  <th className="py-3 px-4 text-center no-print">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-stone-400">Nenhum vendedor ativo.</td></tr>
                ) : rows.map((r) => {
                  const isExpanded = expandedSellerId === r.sellerId;
                  return (
                    <React.Fragment key={r.sellerId}>
                      <tr 
                        onClick={() => toggleExpand(r.sellerId)} 
                        className={`hover:bg-amber-50/40 cursor-pointer transition-colors ${isExpanded ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="py-3 px-6 text-stone-850 font-bold text-sm flex items-center gap-2">
                          <span className="text-stone-400 no-print">
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                          {r.sellerName}
                        </td>
                        <td className="py-3 px-6 text-center">{r.orders}</td>
                        <td className="py-3 px-6 text-right font-black text-stone-850">{brl(r.realized)}</td>
                        <td className="py-3 px-6 text-right font-black text-emerald-700">{brl(r.commission ?? 0)}</td>
                        <td className="py-3 px-6 text-right text-stone-500">{r.goal > 0 ? brl(r.goal) : '—'}</td>
                        <td className="py-3 px-6">
                          {r.goal > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden min-w-16">
                                <div className={`h-full ${r.pctGoal >= 100 ? 'bg-emerald-500' : r.pctGoal >= 60 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${Math.min(100, r.pctGoal)}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-stone-600 w-10 text-right">{r.pctGoal.toFixed(0)}%</span>
                            </div>
                          ) : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="py-3 px-6 text-right text-amber-800 font-bold">{brl(r.projection)}</td>
                        <td className="py-3 px-4 text-center no-print">
                          <button 
                            type="button" 
                            className="text-[11px] font-bold text-amber-800 hover:text-amber-900 underline"
                          >
                            {isExpanded ? 'Fechar' : 'Ver clientes'}
                          </button>
                        </td>
                      </tr>

                      {/* Linha expansível com clientes e pedidos */}
                      {isExpanded && (
                        <tr className="bg-stone-50/60">
                          <td colSpan={8} className="p-4 sm:px-8 sm:py-5 border-b border-stone-200">
                            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-4 shadow-xs">
                              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-amber-700" />
                                  <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">
                                    Clientes que compraram de {r.sellerName} ({r.customers?.length || 0})
                                  </h4>
                                </div>
                                <div className="text-xs font-medium text-stone-500">
                                  Total do Vendedor: <span className="font-black text-stone-900">{brl(r.realized)}</span> · Comissão: <span className="font-black text-emerald-700">{brl(r.commission ?? 0)}</span>
                                </div>
                              </div>

                              {(!r.customers || r.customers.length === 0) ? (
                                <p className="text-stone-400 text-xs py-4 text-center italic">Nenhum pedido realizado por este vendedor no período.</p>
                              ) : (
                                <div className="space-y-4">
                                  {r.customers.map((c) => (
                                    <div key={c.customerId} className="rounded-lg border border-stone-150 p-3 bg-stone-50/30 space-y-2">
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                                        <div className="flex items-center gap-2">
                                          <ShoppingBag className="h-3.5 w-3.5 text-stone-500" />
                                          <span className="font-black text-stone-850 text-xs">{c.customerName}</span>
                                          <span className="text-[10px] text-stone-400 font-medium">({c.ordersCount} pedido{c.ordersCount === 1 ? '' : 's'})</span>
                                        </div>
                                        <div className="text-xs font-bold text-stone-700">
                                          Total do Cliente: <span className="text-stone-900 font-black">{brl(c.total)}</span> · Comissão: <span className="text-emerald-700 font-black">{brl(c.commissionVal)}</span>
                                        </div>
                                      </div>

                                      {/* Tabela de pedidos do cliente */}
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-[11px]">
                                          <thead>
                                            <tr className="text-stone-400 font-bold uppercase border-b border-stone-100">
                                              <th className="py-1 px-2">Nº Pedido</th>
                                              <th className="py-1 px-2">Data</th>
                                              <th className="py-1 px-2 text-center">Status</th>
                                              <th className="py-1 px-2 text-right">Valor do Pedido</th>
                                              <th className="py-1 px-2 text-right text-emerald-700">Comissão</th>
                                              <th className="py-1 px-2 text-center no-print">Ação</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                                            {c.orders.map((ord) => (
                                              <tr key={ord.id} className="hover:bg-white">
                                                <td className="py-1.5 px-2 font-black text-stone-850">
                                                  #{ord.numero}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                  {ord.orderDate ? ord.orderDate.split('-').reverse().join('/') : '—'}
                                                </td>
                                                <td className="py-1.5 px-2 text-center">
                                                  <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-black bg-stone-100 text-stone-700">
                                                    {STATUS_LABELS[ord.status] ?? ord.status}
                                                  </span>
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-black text-stone-850">
                                                  {brl(ord.total)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                                                  {brl(ord.commissionVal)}
                                                </td>
                                                <td className="py-1.5 px-2 text-center no-print">
                                                  <Link 
                                                    href={`/admin/orders?search=${ord.numero}`} 
                                                    className="text-stone-400 hover:text-amber-800 inline-flex items-center gap-0.5 text-[10px] font-bold"
                                                    title="Ver pedido"
                                                  >
                                                    <ExternalLink className="h-3 w-3" />
                                                  </Link>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50 font-black text-stone-900">
                    <td className="py-3 px-6">TOTAL</td>
                    <td className="py-3 px-6 text-center">{totOrders}</td>
                    <td className="py-3 px-6 text-right">{brl(totRealized)}</td>
                    <td className="py-3 px-6 text-right text-emerald-700">{brl(totCommission)}</td>
                    <td className="py-3 px-6 text-right">{totGoal > 0 ? brl(totGoal) : '—'}</td>
                    <td className="py-3 px-6 text-center">{totGoal > 0 ? `${totPct.toFixed(0)}%` : '—'}</td>
                    <td className="py-3 px-6 text-right text-amber-800">{brl(totProjection)}</td>
                    <td className="py-3 px-4 no-print"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
