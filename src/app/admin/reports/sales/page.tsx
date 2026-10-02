'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  Download,
  Printer,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CreditCard,
  UserCheck,
  Award,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';

interface DailySalesOrderItem {
  id: string;
  numero: number;
  orderDate: string;
  createdAt: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  customer: {
    id: string;
    tradeName: string;
    document: string | null;
    phone: string | null;
    neighborhood: string | null;
    city: string | null;
  };
  seller: {
    id: string;
    name: string;
  } | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

interface DailySalesReportResponse {
  date: string;
  formattedDate: string;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
    totalItems: number;
    totalCustomers: number;
    byPaymentMethod: Array<{ method: string; total: number; count: number }>;
    bySeller: Array<{ sellerId: string | null; sellerName: string; total: number; count: number }>;
    byStatus: Array<{ status: string; count: number; total: number }>;
    topProducts: Array<{ productName: string; quantity: number; total: number }>;
  };
  orders: DailySalesOrderItem[];
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'novo':
      return { label: 'Novo', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'confirmado':
      return { label: 'Confirmado', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'em_producao':
      return { label: 'Em Produção', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'entregue':
      return { label: 'Entregue', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'faturado':
      return { label: 'Faturado', bg: 'bg-teal-50 text-teal-700 border-teal-200' };
    case 'cancelado':
      return { label: 'Cancelado', bg: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { label: status, bg: 'bg-stone-50 text-stone-700 border-stone-200' };
  }
}

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminDailySalesReportPage() {
  const todayStr = toLocalDateString(new Date());
  
  // Período padrão: Este mês corrente
  const now = new Date();
  const firstDayMonth = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastDayMonth = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const [fromDate, setFromDate] = useState<string>(firstDayMonth);
  const [toDate, setToDate] = useState<string>(lastDayMonth);
  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'prevMonth' | 'custom'>('month');

  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [data, setData] = useState<DailySalesReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locais da tabela
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const loadReport = useCallback(async (start: string, end: string, cancelled: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ from: start, to: end });
      if (cancelled) params.set('includeCancelled', 'true');

      const res = await fetch(`/api/reports/sales?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Falha ao carregar relatório de vendas.'));
      setData(json);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(fromDate, toDate, includeCancelled);
  }, [fromDate, toDate, includeCancelled, loadReport]);

  const setPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'prevMonth') => {
    setActivePreset(preset);
    const d = new Date();
    if (preset === 'today') {
      const s = toLocalDateString(d);
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const s = toLocalDateString(y);
      setFromDate(s);
      setToDate(s);
    } else if (preset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 6);
      setFromDate(toLocalDateString(w));
      setToDate(toLocalDateString(d));
    } else if (preset === 'month') {
      setFromDate(toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1)));
      setToDate(toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else if (preset === 'prevMonth') {
      setFromDate(toLocalDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setToDate(toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 0)));
    }
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  // Pedidos filtrados
  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    return data.orders.filter((order) => {
      const term = searchTerm.toLowerCase();
      const matchNum = String(order.numero).includes(term);
      const matchCustomer = order.customer.tradeName.toLowerCase().includes(term);
      const matchSeller = (order.seller?.name || '').toLowerCase().includes(term);
      const matchProduct = order.items.some((it) => it.productName.toLowerCase().includes(term));
      const matchSearch = matchNum || matchCustomer || matchSeller || matchProduct;

      const matchStatus = statusFilter === 'todos' || order.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [data?.orders, searchTerm, statusFilter]);

  // Exportar CSV
  const handleExportCSV = () => {
    if (!data?.orders || data.orders.length === 0) {
      alert('Não há vendas para exportar no período.');
      return;
    }

    const headers = [
      'Número',
      'Data',
      'Horário',
      'Status',
      'Cliente',
      'Documento',
      'Telefone',
      'Bairro',
      'Cidade',
      'Vendedor',
      'Forma Pagamento',
      'Qtd Itens',
      'Subtotal (R$)',
      'Desconto (R$)',
      'Total (R$)',
    ];

    const rows = data.orders.map((o) => [
      `#${o.numero}`,
      o.orderDate,
      formatTime(o.createdAt),
      o.status,
      `"${o.customer.tradeName.replace(/"/g, '""')}"`,
      `"${o.customer.document || ''}"`,
      `"${o.customer.phone || ''}"`,
      `"${o.customer.neighborhood || ''}"`,
      `"${o.customer.city || ''}"`,
      `"${o.seller?.name || 'Direta'}"`,
      `"${o.paymentMethod}"`,
      o.items.reduce((acc, it) => acc + it.quantity, 0),
      o.subtotal.toFixed(2),
      o.discount.toFixed(2),
      o.total.toFixed(2),
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_vendas_${data.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const bestProduct = data?.summary?.topProducts?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-amber-700" />
              Relatório Gerencial de Vendas
            </h2>
            <span className="bg-amber-100 text-amber-900 border border-amber-250 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {data?.formattedDate || 'Período'}
            </span>
          </div>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Faturamento consolidado, clientes atendidos, ticket médio e produto campeão por período
          </p>
        </div>

        {/* Barra de Seleção de Período e Presets */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-stone-200 shadow-xs">
          <button
            type="button"
            onClick={() => setPreset('today')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === 'today' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPreset('yesterday')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === 'yesterday' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Ontem
          </button>
          <button
            type="button"
            onClick={() => setPreset('week')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === 'week' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Últimos 7 dias
          </button>
          <button
            type="button"
            onClick={() => setPreset('month')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === 'month' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Este Mês
          </button>
          <button
            type="button"
            onClick={() => setPreset('prevMonth')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === 'prevMonth' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Mês Anterior
          </button>

          <div className="h-4 w-px bg-stone-200 mx-1 hidden sm:block" />

          {/* Seletores manuais De / Até */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
            <span>De:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset('custom');
              }}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-bold text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
            />
            <span>Até:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset('custom');
              }}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-bold text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
            />
          </div>

          <button
            type="button"
            onClick={() => loadReport(fromDate, toDate, includeCancelled)}
            title="Atualizar dados"
            disabled={loading}
            className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Botões de Ações e Opções */}
      <div className="flex flex-wrap justify-between items-center gap-3 pt-1">
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
            className="rounded border-stone-300 text-amber-700 focus:ring-amber-700"
          />
          <span>Exibir pedidos cancelados</span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-stone-500" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-stone-500" />
            Imprimir Relatório
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200 shadow-xs">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Buscando fechamento de vendas...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs text-center border border-red-200 rounded-xl">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Cards de Métricas Principais Solicitadas pelo Gestor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Faturamento Total */}
            <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Faturamento Total</span>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 border border-emerald-100">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900 tracking-tight">
                {formatBRL(data.summary.totalRevenue)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                ✓ {data.summary.totalOrders} pedidos realizados no período
              </p>
            </div>

            {/* 2. Clientes Atendidos */}
            <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Clientes Atendidos</span>
                <div className="rounded-lg bg-sky-50 p-2 text-sky-700 border border-sky-100">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900 tracking-tight">
                {data.summary.totalCustomers}
              </p>
              <p className="mt-1 text-[11px] font-medium text-stone-500">
                Revendedores únicos compradores
              </p>
            </div>

            {/* 3. Ticket Médio */}
            <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Ticket Médio</span>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-700 border border-amber-100">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900 tracking-tight">
                {formatBRL(data.summary.averageTicket)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-stone-500">
                Valor médio por compra no período
              </p>
            </div>

            {/* 4. Produto Campeão */}
            <div className="rounded-2xl bg-white border border-amber-300 bg-amber-50/40 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
                  <Award className="h-4 w-4 text-amber-600" />
                  Produto Campeão
                </span>
                <span className="text-[10px] font-bold bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded">
                  Top 1
                </span>
              </div>
              {bestProduct ? (
                <>
                  <p className="mt-2 text-base font-black text-stone-900 tracking-tight line-clamp-1" title={bestProduct.productName}>
                    {bestProduct.productName}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-amber-900">
                    {bestProduct.quantity} un vendidas • {formatBRL(bestProduct.total)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-stone-400 italic">Nenhum produto vendido</p>
              )}
            </div>
          </div>

          {/* Grids de Composição (Vendedores, Formas de Pagamento e Top Produtos) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Vendas por Vendedor no Dia */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="text-xs font-black uppercase text-stone-800 tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-amber-700" />
                  Vendas por Vendedor
                </h4>
                <span className="text-[10px] font-bold text-stone-400">Total do dia</span>
              </div>

              {data.summary.bySeller.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-4">Nenhuma venda registrada.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.summary.bySeller.map((s, idx) => {
                    const pct = data.summary.totalRevenue > 0 ? (s.total / data.summary.totalRevenue) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-stone-800 truncate max-w-[140px]">
                            {s.sellerName}
                          </span>
                          <span className="font-extrabold text-stone-900">
                            {formatBRL(s.total)}
                            <span className="text-[10px] font-normal text-stone-400 ml-1">({s.count} ped.)</span>
                          </span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-amber-700 h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Formas de Pagamento */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="text-xs font-black uppercase text-stone-800 tracking-wider flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-emerald-700" />
                  Formas de Pagamento
                </h4>
                <span className="text-[10px] font-bold text-stone-400">Faturamento</span>
              </div>

              {data.summary.byPaymentMethod.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-4">Nenhum pagamento registrado.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.summary.byPaymentMethod.map((pm, idx) => {
                    const pct = data.summary.totalRevenue > 0 ? (pm.total / data.summary.totalRevenue) * 100 : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-stone-800 truncate">{pm.method}</span>
                          <span className="font-extrabold text-stone-900">
                            {formatBRL(pm.total)}
                            <span className="text-[10px] font-normal text-stone-400 ml-1">({pm.count})</span>
                          </span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mais Vendidos no Dia */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="text-xs font-black uppercase text-stone-800 tracking-wider flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-purple-700" />
                  Mais Vendidos do Dia
                </h4>
                <span className="text-[10px] font-bold text-stone-400">Quantidades</span>
              </div>

              {data.summary.topProducts.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-4">Nenhum item vendido.</p>
              ) : (
                <div className="space-y-2">
                  {data.summary.topProducts.slice(0, 5).map((tp, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-stone-50 last:border-0">
                      <span className="font-bold text-stone-800 truncate max-w-[160px]">
                        {idx + 1}. {tp.productName}
                      </span>
                      <span className="font-extrabold text-purple-900">
                        {tp.quantity} un <span className="text-[10px] font-normal text-stone-400">({formatBRL(tp.total)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabela de Vendas / Pedidos do Dia */}
          <div className="rounded-2xl bg-white border border-stone-200 shadow-xs overflow-hidden space-y-4 p-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="text-sm font-extrabold text-stone-900 tracking-tight flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-amber-700" />
                Relação Completa de Vendas ({filteredOrders.length} pedidos)
              </h3>

              {/* Filtros da Tabela */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-60">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Buscar cliente, nº ou produto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 py-1.5 text-xs text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
                >
                  <option value="todos">Todos os status</option>
                  <option value="novo">Novo</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="em_producao">Em Produção</option>
                  <option value="entregue">Entregue</option>
                  <option value="faturado">Faturado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                Nenhum pedido encontrado com os filtros selecionados para o período informado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3">Pedido</th>
                      <th className="py-3 px-3">Hora</th>
                      <th className="py-3 px-3">Cliente</th>
                      <th className="py-3 px-3">Vendedor</th>
                      <th className="py-3 px-3">Pagamento</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Valor Total</th>
                      <th className="py-3 px-3 text-center">Itens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                    {filteredOrders.map((order) => {
                      const badge = getStatusBadge(order.status);
                      const isExpanded = Boolean(expandedOrders[order.id]);

                      return (
                        <React.Fragment key={order.id}>
                          <tr className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-3">
                              <Link
                                href={`/admin/orders?search=%23${order.numero}`}
                                className="font-extrabold text-amber-800 hover:text-amber-900 hover:underline flex items-center gap-1"
                              >
                                #{order.numero}
                                <ExternalLink className="h-3 w-3 text-stone-400" />
                              </Link>
                            </td>
                            <td className="py-3 px-3 text-stone-500 font-medium">
                              {formatTime(order.createdAt)}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-stone-900">{order.customer.tradeName}</div>
                              <div className="text-[10px] text-stone-400 font-normal">
                                {order.customer.neighborhood ? `${order.customer.neighborhood}, ` : ''}
                                {order.customer.city || ''}
                                {order.customer.document ? ` • ${order.customer.document}` : ''}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-stone-600">
                              {order.seller?.name || <span className="text-stone-400 italic">Venda Direta</span>}
                            </td>
                            <td className="py-3 px-3 text-stone-600 font-medium">
                              {order.paymentMethod}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-black text-stone-900 text-sm">
                              {formatBRL(order.total)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleOrderExpand(order.id)}
                                className="p-1 rounded-md hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                                title="Ver itens do pedido"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </td>
                          </tr>

                          {/* Linha Expansível com Itens do Pedido */}
                          {isExpanded && (
                            <tr className="bg-stone-50/80">
                              <td colSpan={8} className="py-3 px-6">
                                <div className="rounded-xl bg-white border border-stone-200 p-3 space-y-2 shadow-2xs">
                                  <div className="flex justify-between items-center text-xs border-b border-stone-100 pb-1.5">
                                    <span className="font-extrabold text-stone-800">
                                      Produtos no Pedido #{order.numero} ({order.items.length} itens):
                                    </span>
                                    {order.discount > 0 && (
                                      <span className="text-red-700 font-bold text-[11px]">
                                        Desconto total: -{formatBRL(order.discount)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {order.items.map((it) => (
                                      <div
                                        key={it.id}
                                        className="rounded-lg bg-stone-50 p-2 border border-stone-150 flex justify-between items-center text-xs"
                                      >
                                        <div className="truncate pr-2">
                                          <div className="font-bold text-stone-800 truncate">{it.productName}</div>
                                          <div className="text-[10px] text-stone-500 font-medium">
                                            {it.quantity} un × {formatBRL(it.unitPrice)}
                                          </div>
                                        </div>
                                        <div className="font-extrabold text-stone-900 shrink-0">
                                          {formatBRL(it.subtotal)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-200 bg-stone-50 text-xs font-black text-stone-900">
                      <td colSpan={6} className="py-3 px-3 uppercase text-[11px]">
                        Total dos pedidos listados ({filteredOrders.length} pedidos):
                      </td>
                      <td className="py-3 px-3 text-right text-base text-emerald-800">
                        {formatBRL(filteredOrders.reduce((acc, o) => (o.status !== 'cancelado' ? acc + o.total : acc), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
