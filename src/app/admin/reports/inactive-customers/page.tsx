'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  UserX,
  Loader2,
  Printer,
  Download,
  Calendar,
  AlertTriangle,
  MessageSquare,
  Search,
  Filter,
  DollarSign,
  TrendingDown,
  Phone,
  Store,
  Clock,
  ArrowUpDown
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { InactiveCustomerRow, InactiveCustomersReport } from '@/server/services/reports';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function InactiveCustomersReportPage() {
  const [data, setData] = useState<InactiveCustomersReport | null>(null);
  const [days, setDays] = useState('15');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locais
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'days' | 'historical' | 'lastOrder'>('historical');

  // Carregar vendedores para o select
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/sellers');
        if (res.ok) {
          const json = await res.json();
          const list = json.data ?? json;
          if (Array.isArray(list)) {
            setSellers(list.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
          }
        }
      } catch {
        /* silencioso */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (days) params.set('days', days);
      if (sellerId) params.set('sellerId', sellerId);

      const res = await fetch(`/api/reports/inactive-customers?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar relatório de inativos.'));
      setData((json.data ?? json) as InactiveCustomersReport);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days, sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const customers = data?.customers ?? [];

  const filteredAndSorted = useMemo(() => {
    const list = customers.filter((c) => {
      const q = searchTerm.toLowerCase();
      return (
        c.tradeName.toLowerCase().includes(q) ||
        (c.legalName ?? '').toLowerCase().includes(q) ||
        (c.neighborhood ?? '').toLowerCase().includes(q) ||
        c.sellerName.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'days') return b.daysInactive - a.daysInactive;
      if (sortBy === 'historical') return b.totalRevenueHistorical - a.totalRevenueHistorical;
      if (sortBy === 'lastOrder') return b.lastOrderTotal - a.lastOrderTotal;
      return 0;
    });

    return list;
  }, [customers, searchTerm, sortBy]);

  const exportCsv = () => {
    if (!data) return;
    const sep = ';';
    const head = [
      'Cliente (Nome Fantasia)',
      'Razão Social',
      'Documento',
      'Telefone',
      'Bairro',
      'Vendedor',
      'Dias Sem Comprar',
      'Último Pedido (Data)',
      'Valor Último Pedido (R$)',
      'Qtd Total Pedidos',
      'Faturamento Histórico (R$)',
    ].join(sep);

    const body = filteredAndSorted
      .map((c) => [
        `"${c.tradeName.replace(/"/g, '""')}"`,
        `"${(c.legalName ?? '').replace(/"/g, '""')}"`,
        `"${c.document ?? ''}"`,
        `"${c.phone ?? ''}"`,
        `"${c.neighborhood ?? ''}"`,
        `"${c.sellerName.replace(/"/g, '""')}"`,
        c.daysInactive,
        c.lastOrderDate ?? 'Nunca comprou',
        c.lastOrderTotal.toFixed(2).replace('.', ','),
        c.totalOrders,
        c.totalRevenueHistorical.toFixed(2).replace('.', ','),
      ].join(sep))
      .join('\n');

    const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-inativos-mais-${days}-dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendWhatsApp = (c: InactiveCustomerRow) => {
    const raw = c.phone || '';
    const clean = raw.replace(/\D/g, '');
    const text = encodeURIComponent(c.suggestedWhatsAppMessage);
    const url = clean ? `https://api.whatsapp.com/send?phone=55${clean}&text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700">
              <UserX className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-black text-stone-900 tracking-tight">
              Recuperação de Clientes Inativos (Churn)
            </h2>
          </div>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Identifique revendedores e lojistas sumidos há mais de X dias e dispare mensagens de reativação com 1 clique
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <Printer className="h-4 w-4 text-stone-400" />
            Imprimir
          </button>
          <button
            onClick={exportCsv}
            disabled={!data || filteredAndSorted.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-stone-300" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Barra de Filtros Operacionais */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4.5 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
            Tempo Sem Comprar
          </label>
          <div className="relative">
            <Clock className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              <option value="7">Mais de 7 dias (Alerta Semanal)</option>
              <option value="15">Mais de 15 dias (Em Risco)</option>
              <option value="30">Mais de 30 dias (Inativo / Churn)</option>
              <option value="60">Mais de 60 dias (Crítico)</option>
              <option value="90">Mais de 90 dias (Perdido)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
            Filtrar Vendedor
          </label>
          <select
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          >
            <option value="">Todos os Vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
            Buscar Cliente / Bairro
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Nome ou bairro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
            Ordenar Por
          </label>
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'days' | 'historical' | 'lastOrder')}
              className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              <option value="historical">Maior Histórico Perdido (R$)</option>
              <option value="days">Mais Dias Sem Pedir</option>
              <option value="lastOrder">Valor do Último Pedido</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Revendas Inativas ({`>${days}d`})
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-black">
              {filteredAndSorted.length}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-650 tracking-tight">
              {filteredAndSorted.length}
            </span>
            <span className="text-xs text-stone-400 font-semibold">clientes sumidos</span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            Requerem contato de reposição imediato da distribuidora.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Receita Histórica em Risco
            </span>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              {brl(data?.totalHistoricalLost ?? 0)}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            Faturamento total já realizado por estes clientes que agora pararam.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Média por Último Pedido
            </span>
            <Store className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              {brl(
                filteredAndSorted.length > 0
                  ? filteredAndSorted.reduce((acc, c) => acc + c.lastOrderTotal, 0) / filteredAndSorted.length
                  : 0
              )}
            </span>
          </div>
          <p className="text-[11px] text-stone-500 mt-1">
            Ticket potencial imediato recuperado por cada pedido reativado.
          </p>
        </div>
      </div>

      {/* Tabela de Inativos */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-rose-600" />
            <p className="text-xs text-stone-500 font-semibold">Analisando histórico de recompra...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm">Falha ao carregar inativos</h3>
            <p className="text-xs text-stone-500 mt-1">{error}</p>
            <button
              onClick={load}
              className="mt-3 px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <Store className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm">Nenhum cliente inativo no critério</h3>
            <p className="text-xs text-stone-500 mt-1">
              Excelente notícia! Todos os seus pontos de revenda estão comprando com frequência.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/70 text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5">Ponto de Revenda / Loja</th>
                  <th className="py-3 px-4">Localização & Vendedor</th>
                  <th className="py-3 px-4 text-center">Dias Sem Pedido</th>
                  <th className="py-3 px-4 text-right">Último Pedido</th>
                  <th className="py-3 px-4 text-right">Histórico Total</th>
                  <th className="py-3 px-5 text-center">Ação Imediata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {filteredAndSorted.map((c) => (
                  <tr key={c.customerId} className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-bold text-stone-900 text-sm">{c.tradeName}</div>
                      <div className="text-[10px] text-stone-400 font-medium">
                        {c.legalName ? `${c.legalName} • ` : ''}
                        {c.document ?? 'Sem documento'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-stone-800 font-semibold">{c.neighborhood || 'Centro'}</div>
                      <div className="text-[10px] text-stone-400">
                        Vendedor: <span className="text-amber-800 font-bold">{c.sellerName}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800">
                        <Clock className="h-3 w-3" />
                        {c.daysInactive >= 999 ? 'Sem pedidos' : `${c.daysInactive} dias`}
                      </span>
                      {c.lastOrderDate && (
                        <div className="text-[9px] text-stone-400 mt-0.5">
                          {c.lastOrderDate.slice(8, 10)}/{c.lastOrderDate.slice(5, 7)}/{c.lastOrderDate.slice(0, 4)}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="font-black text-stone-800">{brl(c.lastOrderTotal)}</div>
                      <div className="text-[10px] text-stone-400 font-medium">
                        {c.totalOrders} {c.totalOrders === 1 ? 'pedido emitido' : 'pedidos emitidos'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-black text-stone-900">
                      {brl(c.totalRevenueHistorical)}
                    </td>

                    <td className="py-3.5 px-5 text-center">
                      <button
                        onClick={() => handleSendWhatsApp(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                        title="Enviar mensagem personalizada de reposição via WhatsApp"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Reativar no WhatsApp
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
