'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Printer, Download, Calendar } from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface Row {
  customerId: string;
  customerName: string;
  orders: number;
  total: number;
  average: number;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CustomerReportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/reports/customers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao gerar o relatório.'));
      setRows((data.data ?? []) as Row[]);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
    // Só na montagem; o botão "Aplicar" recarrega com o período.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPedidos = rows.reduce((s, r) => s + r.orders, 0);
  const totalValor = rows.reduce((s, r) => s + r.total, 0);
  const ticketGeral = totalPedidos > 0 ? totalValor / totalPedidos : 0;

  const exportCsv = () => {
    const sep = ';';
    const head = ['Cliente', 'Nº Pedidos', 'Ticket Médio', 'Valor Total'].join(sep);
    const body = rows
      .map((r) => [
        `"${r.customerName.replace(/"/g, '""')}"`,
        r.orders,
        r.average.toFixed(2).replace('.', ','),
        r.total.toFixed(2).replace('.', ','),
      ].join(sep))
      .join('\r\n');
    const totals = ['TOTAL', totalPedidos, ticketGeral.toFixed(2).replace('.', ','), totalValor.toFixed(2).replace('.', ',')].join(sep);
    const csv = `﻿${head}\r\n${body}\r\n${totals}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-clientes${from ? `-${from}` : ''}${to ? `-a-${to}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-6">
      <style>{`@media print { body * { visibility: hidden !important; } .report-print, .report-print * { visibility: visible !important; } .report-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>

      <div className="flex justify-between items-center no-print">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-700" />
            Relatório de Clientes
          </h2>
          <p className="text-xs text-stone-500 font-medium">Pedidos, ticket médio e total por cliente no período.</p>
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

      <div className="report-print rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
        <div className="hidden print:block p-4 border-b border-stone-200">
          <h3 className="text-base font-black text-stone-900">Relatório de Clientes — Doces Prigor</h3>
          <p className="text-xs text-stone-500">Período: {from || 'início'} até {to || 'hoje'}</p>
        </div>
        {loading ? (
          <div className="flex h-60 items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin text-amber-700" /><span className="text-xs text-stone-500 font-medium">Gerando...</span></div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 text-xs text-center">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">Cliente</th>
                  <th className="py-3 px-6 text-center">Nº Pedidos</th>
                  <th className="py-3 px-6 text-right">Ticket Médio</th>
                  <th className="py-3 px-6 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-stone-400">Nenhum pedido no período.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.customerId} className="hover:bg-stone-50/50">
                    <td className="py-3 px-6 text-stone-850 font-bold text-sm">{r.customerName}</td>
                    <td className="py-3 px-6 text-center">{r.orders}</td>
                    <td className="py-3 px-6 text-right">{brl(r.average)}</td>
                    <td className="py-3 px-6 text-right font-black text-stone-850">{brl(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50 font-black text-stone-900">
                    <td className="py-3 px-6">TOTAL ({rows.length} clientes)</td>
                    <td className="py-3 px-6 text-center">{totalPedidos}</td>
                    <td className="py-3 px-6 text-right">{brl(ticketGeral)}</td>
                    <td className="py-3 px-6 text-right text-amber-800">{brl(totalValor)}</td>
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
