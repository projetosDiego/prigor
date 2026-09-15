'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Loader2,
  Printer,
  Download,
  Calendar,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
  MessageSquare,
  Search,
  Users,
  DollarSign
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { CustomerReportRow } from '@/server/services/reports';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CustomerReportPage() {
  const [rows, setRows] = useState<CustomerReportRow[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locais
  const [searchTerm, setSearchTerm] = useState('');
  const [alertOnlyFilter, setAlertOnlyFilter] = useState(false);

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
      setRows((data.data ?? []) as CustomerReportRow[]);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = !searchTerm || r.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchAlert = !alertOnlyFilter || r.weeklyAlert;
      return matchSearch && matchAlert;
    });
  }, [rows, searchTerm, alertOnlyFilter]);

  const totalPedidos = filteredRows.reduce((s, r) => s + r.orders, 0);
  const totalValor = filteredRows.reduce((s, r) => s + r.total, 0);
  const ticketGeral = totalPedidos > 0 ? totalValor / totalPedidos : 0;
  const clientesEmAlerta = rows.filter((r) => r.weeklyAlert).length;
  const clientesComQueda = rows.filter((r) => r.trend === 'dropping').length;

  const exportCsv = () => {
    const sep = ';';
    const head = [
      'Cliente',
      'Telefone',
      'Nº Pedidos',
      'Ticket Médio (R$)',
      'Valor Total (R$)',
      'Última Compra',
      'Dias Sem Comprar',
      'Último Pedido (R$)',
      'Pedido Anterior (R$)',
      'Variação (%)',
      'Alerta Semanal',
    ].join(sep);

    const body = rows
      .map((r) => [
        `"${r.customerName.replace(/"/g, '""')}"`,
        `"${r.phone || ''}"`,
        r.orders,
        r.average.toFixed(2).replace('.', ','),
        r.total.toFixed(2).replace('.', ','),
        r.lastOrderDate || '—',
        r.daysSinceLastOrder,
        r.lastOrderTotal !== null ? r.lastOrderTotal.toFixed(2).replace('.', ',') : '—',
        r.previousOrderTotal !== null ? r.previousOrderTotal.toFixed(2).replace('.', ',') : '—',
        r.trendPercent !== null ? `${r.trendPercent}%` : '—',
        r.weeklyAlert ? 'SIM' : 'NÃO',
      ].join(sep))
      .join('\r\n');

    const totals = ['TOTAL', '', totalPedidos, ticketGeral.toFixed(2).replace('.', ','), totalValor.toFixed(2).replace('.', ','), '', '', '', '', '', ''].join(sep);
    const csv = `\ufeff${head}\r\n${body}\r\n${totals}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-clientes-saude${from ? `-${from}` : ''}${to ? `-a-${to}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <style>{`@media print { body * { visibility: hidden !important; } .report-print, .report-print * { visibility: visible !important; } .report-print { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-700" />
            Relatório de Clientes & Recompra Semanal
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Acompanhe o faturamento por cliente e detecte clientes que diminuíram os pedidos semanais
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-xs cursor-pointer"
          >
            <Printer className="h-4 w-4 text-stone-500" /> Imprimir
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs cursor-pointer"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* CARDS DE RESUMO DA SAÚDE DOS CLIENTES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
          <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block">Clientes no Período</span>
          <p className="text-2xl font-black text-stone-900 mt-1">{rows.length}</p>
          <span className="text-[11px] text-stone-500">Com pedidos no intervalo</span>
        </div>

        <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
          <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block">Faturamento Total</span>
          <p className="text-2xl font-black text-stone-900 mt-1">{brl(totalValor)}</p>
          <span className="text-[11px] text-stone-500">{totalPedidos} pedidos fechados</span>
        </div>

        <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
          <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider block">Ticket Médio Geral</span>
          <p className="text-2xl font-black text-stone-900 mt-1">{brl(ticketGeral)}</p>
          <span className="text-[11px] text-stone-500">Média por pedido</span>
        </div>

        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-red-800 uppercase tracking-wider block">Clientes em Alerta</span>
            <AlertTriangle className="h-4 w-4 text-red-700" />
          </div>
          <p className="text-2xl font-black text-red-950 mt-1">{clientesEmAlerta}</p>
          <span className="text-[11px] text-red-800 font-medium">
            {clientesComQueda} tiveram queda &gt;15% no último pedido
          </span>
        </div>
      </div>

      {/* FILTROS E BUSCA */}
      <div className="rounded-xl bg-white p-4 shadow-xs border border-stone-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-stone-700 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={alertOnlyFilter}
              onChange={(e) => setAlertOnlyFilter(e.target.checked)}
              className="rounded border-stone-300 text-red-600 focus:ring-red-600"
            />
            <span className="text-red-750">⚠️ Apenas clientes com queda / alerta</span>
          </label>
        </div>

        {/* Filtro por Data */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50"
              title="Data inicial"
            />
          </div>
          <span className="text-xs text-stone-400">até</span>
          <div className="relative">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50"
              title="Data final"
            />
          </div>
          <button
            onClick={load}
            className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs px-3 py-1.5 cursor-pointer shadow-2xs"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* TABELA ANALÍTICA */}
      <div className="report-print rounded-2xl bg-white shadow-xs border border-stone-200 overflow-hidden">
        <div className="hidden print:block p-4 border-b border-stone-200">
          <h3 className="text-base font-black text-stone-900">Relatório de Clientes & Saúde de Recompra — Doces Prigor</h3>
          <p className="text-xs text-stone-500">Período: {from || 'início'} até {to || 'hoje'}</p>
        </div>

        {loading ? (
          <div className="flex h-60 items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
            <span className="text-xs text-stone-500 font-medium">Analisando histórico de pedidos dos clientes...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 text-xs text-center">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-3 text-center">Última Compra</th>
                  <th className="py-3 px-3 text-right">Último Pedido</th>
                  <th className="py-3 px-3 text-center">Variação vs Anterior</th>
                  <th className="py-3 px-3 text-center">Status Semanal</th>
                  <th className="py-3 px-3 text-center">Nº Pedidos</th>
                  <th className="py-3 px-3 text-right">Ticket Médio</th>
                  <th className="py-3 px-4 text-right">Total Acumulado</th>
                  <th className="py-3 px-3 text-center no-print">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-stone-400">
                      Nenhum cliente encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const cleanPhone = (r.phone || '').replace(/\D/g, '');
                    return (
                      <tr key={r.customerId} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-stone-900 font-bold text-sm block">{r.customerName}</span>
                          {r.phone && <span className="text-[10px] text-stone-400 font-normal">{r.phone}</span>}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {r.lastOrderDate ? (
                            <div>
                              <span className="text-stone-800 block font-medium">{r.lastOrderDate}</span>
                              <span className="text-[10px] text-stone-400">
                                {r.daysSinceLastOrder === 0
                                  ? 'hoje'
                                  : r.daysSinceLastOrder === 1
                                  ? 'ontem'
                                  : `há ${r.daysSinceLastOrder} dias`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic">Nunca</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-stone-900">
                          {r.lastOrderTotal !== null ? brl(r.lastOrderTotal) : '—'}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {r.trendPercent !== null ? (
                            <div className="inline-flex items-center gap-1 font-bold">
                              {r.trend === 'dropping' ? (
                                <span className="inline-flex items-center gap-0.5 text-red-700 bg-red-50 border border-red-150 px-2 py-0.5 rounded-full text-[10px]">
                                  <TrendingDown className="h-3 w-3" />
                                  {r.trendPercent}%
                                </span>
                              ) : r.trend === 'growing' ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-full text-[10px]">
                                  <TrendingUp className="h-3 w-3" />
                                  +{r.trendPercent}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-stone-600 bg-stone-50 border border-stone-150 px-2 py-0.5 rounded-full text-[10px]">
                                  <Minus className="h-3 w-3" />
                                  {r.trendPercent}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-stone-400 text-[10px]">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {r.weeklyAlert ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[10px] font-extrabold text-red-750" title={r.daysSinceLastOrder > 7 ? 'Sem pedido há mais de 7 dias' : 'Queda maior que 15% no pedido'}>
                              <AlertTriangle className="h-3 w-3 text-red-600 shrink-0" />
                              {r.daysSinceLastOrder > 7 ? 'Atrasado' : 'Queda'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              Normal
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center font-bold text-stone-800">
                          {r.orders}
                        </td>

                        <td className="py-3 px-3 text-right text-stone-600">
                          {brl(r.average)}
                        </td>

                        <td className="py-3 px-4 text-right font-black text-stone-900 text-sm">
                          {brl(r.total)}
                        </td>

                        <td className="py-3 px-3 text-center no-print">
                          {cleanPhone ? (
                            <a
                              href={`https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(
                                r.weeklyAlert
                                  ? `Olá ${r.customerName}! Tudo bem? Notamos que na última semana a reposição de doces foi um pouco menor ou ainda não foi feita. Está tudo certinho por aí? Podemos programar sua entrega desta semana com as novidades da Doces Prigor? 🍬`
                                  : `Olá ${r.customerName}! Passando para confirmar seu pedido desta semana da Doces Prigor. Posso fechar a rota de entrega da sua loja?`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-850 hover:bg-emerald-100 transition-colors"
                              title="Enviar mensagem via WhatsApp"
                            >
                              <MessageSquare className="h-3 w-3 text-emerald-700" />
                              Contato
                            </a>
                          ) : (
                            <span className="text-[10px] text-stone-300 italic">Sem whats</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50 font-black text-stone-900">
                    <td className="py-3 px-4 uppercase text-[10px]">
                      TOTAL ({filteredRows.length} clientes)
                    </td>
                    <td colSpan={4}></td>
                    <td className="py-3 px-3 text-center">{totalPedidos}</td>
                    <td className="py-3 px-3 text-right">{brl(ticketGeral)}</td>
                    <td className="py-3 px-4 text-right text-emerald-800 text-sm">{brl(totalValor)}</td>
                    <td className="no-print"></td>
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
