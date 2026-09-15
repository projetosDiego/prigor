'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  BarChart3, 
  Users, 
  Flame, 
  Award, 
  Clock, 
  Loader2,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Package,
  Scale,
  ShoppingCart,
  Calendar,
  Truck,
  ArrowRight,
  ExternalLink,
  Target,
  UserCheck,
  Percent,
  TrendingDown,
  AlertCircle
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import type { DashboardStats } from '@/server/services/dashboard';

// CRM Types (Expansão)
interface CRMData {
  summary: {
    totalLeads: number;
    totalCustomers: number;
    activeSellersCount: number;
    conversionRate: number;
    avgConversionTimeDays: number;
  };
  funnel: Record<string, number>;
  sellerPerformance: {
    id: string;
    name: string;
    leadsReceived: number;
    visitsLogged: number;
    conversions: number;
    goal: number;
    conversionRate: number;
  }[];
  neighborhoodPerformance: {
    neighborhood: string;
    totalLeads: number;
    conversions: number;
    conversionRate: number;
  }[];
  categoryPerformance: {
    category: string;
    totalLeads: number;
    conversions: number;
    conversionRate: number;
  }[];
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
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

export default function AdminDashboardPage() {
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [erpData, setErpData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Controle de abas — agora a aba inicial é "vendas" (Visão Executiva Comercial)
  const [activeTab, setActiveTab] = useState<'vendas' | 'crm' | 'financeiro' | 'producao'>('vendas');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Dispara as requisições em paralelo
      const [resCrm, resErp] = await Promise.all([
        fetch('/api/dashboard/admin'),
        fetch('/api/dashboard/erp')
      ]);

      if (!resCrm.ok) {
        throw new Error(await responseErrorMessage(resCrm, 'Erro ao carregar dados do CRM.'));
      }

      if (!resErp.ok) {
        throw new Error(await responseErrorMessage(resErp, 'Erro ao carregar dados do ERP.'));
      }

      const crmJson: CRMData = await resCrm.json();
      const erpJson: DashboardStats = await resErp.json();

      setCrmData(crmJson);
      setErpData(erpJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao obter dados consolidados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
        <p className="text-sm text-stone-500 font-medium">Consolidando informações do ecossistema comercial...</p>
      </div>
    );
  }

  if (error || !crmData || !erpData) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 max-w-xl mx-auto mt-8">
        <h3 className="font-bold text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Falha na Conexão do Painel
        </h3>
        <p className="mt-2 text-sm">{error || 'Erro ao obter dados consolidados'}</p>
        <button onClick={fetchData} className="mt-4 rounded-lg bg-red-750 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all cursor-pointer">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-700" />
            Central Executiva de Vendas
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Acompanhamento em tempo real de faturamento, projeção de mês, metas e entregas
          </p>
        </div>
        
        {/* Filtro de Abas */}
        <div className="bg-stone-150 p-1 rounded-xl flex flex-wrap gap-1 self-start w-full sm:w-auto">
          <button 
            onClick={() => setActiveTab('vendas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'vendas' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Vendas & Fechamento
          </button>
          <button 
            onClick={() => setActiveTab('financeiro')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'financeiro' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Fluxo Financeiro
          </button>
          <button 
            onClick={() => setActiveTab('producao')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'producao' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Estoque & Fábrica
          </button>
          <button 
            onClick={() => setActiveTab('crm')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'crm' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Expansão (Leads)
          </button>
        </div>
      </div>

      {/* ABA PRINCIPAL: VENDAS & FECHAMENTO EXECUTIVO */}
      {activeTab === 'vendas' && (
        <div className="space-y-6">
          {/* CARDS PRINCIPAIS: ONTEM, HOJE, MÊS, PROJEÇÃO E COMPARATIVO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card Vendas de Ontem */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">
                  Vendas de Ontem ({formatarData(erpData.yesterday?.date)})
                </span>
                <div className="rounded-lg bg-stone-100 p-2 text-stone-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-stone-900 tracking-tight">
                {formatBRL(erpData.yesterday?.revenue ?? 0)}
              </p>
              <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
                <span>{erpData.yesterday?.orders ?? 0} pedidos fechados</span>
                <span>Ticket: {formatBRL(erpData.yesterday?.averageTicket ?? 0)}</span>
              </div>
            </div>

            {/* Card Vendas de Hoje */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">
                    Vendas de Hoje
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Tempo Real" />
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 border border-emerald-100">
                  <ShoppingCart className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-900 tracking-tight">
                {formatBRL(erpData.today?.revenue ?? 0)}
              </p>
              <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
                <span>{erpData.today?.orders ?? 0} pedidos hoje</span>
                <Link
                  href={`/admin/reports/sales`}
                  className="font-bold text-amber-800 hover:text-amber-900 hover:underline flex items-center gap-0.5"
                >
                  Ver dia <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Card Faturamento Acumulado no Mês vs Meta */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">
                  Faturamento do Mês
                </span>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-700 border border-amber-100">
                  <Target className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-stone-900 tracking-tight">
                {formatBRL(erpData.monthProjection?.realized ?? erpData.orders.monthGrossValue)}
              </p>
              
              {/* Barra de Progresso da Meta */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-stone-500">
                  <span>Meta: {formatBRL(erpData.monthProjection?.goal ?? 0)}</span>
                  <span className="text-amber-850">{(erpData.monthProjection?.percentGoal ?? 0).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-amber-700 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, erpData.monthProjection?.percentGoal ?? 0)}%` }} 
                  />
                </div>
              </div>
            </div>

            {/* Card Projeção do Mês (Forecast) */}
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">
                  Projeção do Mês (Forecast)
                </span>
                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700 border border-indigo-100">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-indigo-950 tracking-tight">
                {formatBRL(erpData.monthProjection?.projection ?? 0)}
              </p>
              <div className="flex items-center justify-between text-[11px] pt-1 font-semibold">
                <span className="text-stone-500">
                  Dia {erpData.monthProjection?.daysElapsed ?? 1} de {erpData.monthProjection?.totalDays ?? 30}
                </span>
                {erpData.monthProjection?.growthPercent !== undefined && (
                  <span className={`flex items-center gap-0.5 font-bold ${
                    erpData.monthProjection.growthPercent >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {erpData.monthProjection.growthPercent >= 0 ? '+' : ''}
                    {erpData.monthProjection.growthPercent.toFixed(1)}% vs anterior
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* FAIXA DE ALERTAS OPERACIONAIS IMEDIATOS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Alerta Entregas Hoje */}
            <Link
              href="/admin/orders"
              className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-center justify-between hover:bg-amber-100/60 transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-200/70 p-2 text-amber-850">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-amber-950 block">Entregas para Hoje</span>
                  <span className="text-[11px] text-amber-800 font-medium">
                    {erpData.alerts?.deliveriesToday ?? erpData.orders.pendingDeliveries} pedidos em rota ou produção
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-700 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Alerta Clientes Sem Comprar */}
            <Link
              href="/admin/reports/inactive-customers"
              className="rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 flex items-center justify-between hover:bg-orange-100/60 transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-200/70 p-2 text-orange-850">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-orange-950 block">Clientes Sem Comprar (+15 dias)</span>
                  <span className="text-[11px] text-orange-800 font-medium">
                    {erpData.alerts?.inactiveCustomersCount ?? 0} revendedores precisam de contato
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-orange-700 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Alerta Títulos Vencidos */}
            <Link
              href="/admin/financial"
              className="rounded-xl border border-red-200 bg-red-50/70 p-3.5 flex items-center justify-between hover:bg-red-100/60 transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-200/70 p-2 text-red-850">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-red-950 block">Contas a Receber Vencidas</span>
                  <span className="text-[11px] text-red-800 font-medium">
                    {formatBRL(erpData.alerts?.overdueReceivableTotal ?? erpData.financial.overdueReceivable)} ({erpData.alerts?.overdueReceivableCount ?? 0} títulos)
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-red-700 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* GRID COMERCIAL: RANKING DE VENDEDORES & DOCES CAMPEÕES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ranking de Vendedores no Mês */}
            <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-700" />
                  <h3 className="text-sm font-extrabold text-stone-900">Desempenho da Equipe de Vendas</h3>
                </div>
                <Link
                  href="/admin/reports/sellers"
                  className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1"
                >
                  Relatório Completo <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {(!erpData.sellersRanking || erpData.sellersRanking.length === 0) ? (
                <p className="text-xs text-stone-400 text-center py-6">Nenhum vendedor registrado no mês.</p>
              ) : (
                <div className="space-y-3.5">
                  {erpData.sellersRanking.map((s, idx) => (
                    <div key={s.id} className="space-y-1.5 p-2 rounded-xl hover:bg-stone-50 transition-colors">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-stone-900 flex items-center gap-2">
                          <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'
                          }`}>
                            {idx + 1}
                          </span>
                          {s.name}
                          <span className="text-[10px] font-normal text-stone-400">({s.ordersCount} pedidos)</span>
                        </span>
                        <div className="text-right">
                          <span className="font-black text-stone-900 block">{formatBRL(s.realized)}</span>
                          <span className="text-[10px] font-bold text-stone-400">
                            Meta: {formatBRL(s.goal)} ({s.percentGoal.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-amber-700 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, s.percentGoal)}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Doces Mais Vendidos no Mês */}
            <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-purple-700" />
                  <h3 className="text-sm font-extrabold text-stone-900">Doces Campeões de Venda (Mês)</h3>
                </div>
                <Link
                  href="/admin/reports/products-abc"
                  className="text-xs font-bold text-purple-800 hover:underline flex items-center gap-1"
                >
                  Curva ABC <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {erpData.topProducts.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-6">Nenhum produto faturado no mês.</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {erpData.topProducts.map((p, idx) => (
                    <div key={p.productId} className="py-2.5 flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2.5 truncate max-w-[240px]">
                        <span className="text-[11px] font-black text-stone-400">#{idx + 1}</span>
                        <span className="font-bold text-stone-850 truncate">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-stone-900 block">{formatBRL(p.total)}</span>
                        <span className="text-[10px] font-bold text-purple-700">{p.quantity} unidades</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ÚLTIMOS PEDIDOS EMITIDOS */}
          <div className="rounded-2xl bg-white border border-stone-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-stone-700" />
                <h3 className="text-sm font-extrabold text-stone-900">Últimos Pedidos Emitidos</h3>
              </div>
              <Link
                href="/admin/orders"
                className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1"
              >
                Ver Todos os Pedidos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Pedido</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Cliente</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Valor Total</th>
                    <th className="py-2.5 px-3 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                  {erpData.latestOrders.map((o) => {
                    const badge = getStatusBadge(o.status);
                    return (
                      <tr key={o.id} className="hover:bg-stone-50/60">
                        <td className="py-2.5 px-3 font-extrabold text-amber-800">
                          #{o.numero}
                        </td>
                        <td className="py-2.5 px-3 text-stone-500 font-medium">
                          {formatarData(o.orderDate)}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-stone-900">
                          {o.customerName}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-stone-900">
                          {formatBRL(o.total)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Link
                            href={`/admin/orders?search=%23${o.numero}`}
                            className="text-stone-400 hover:text-amber-800 transition-colors inline-block"
                            title="Visualizar pedido"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA FINANCEIRO */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">A Receber</span>
              <span className="text-2xl font-black text-emerald-800 mt-1 block">{formatBRL(erpData.financial.receivable)}</span>
              <span className="text-[11px] text-stone-500 mt-1 block">Títulos pendentes</span>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">A Pagar</span>
              <span className="text-2xl font-black text-red-800 mt-1 block">{formatBRL(erpData.financial.payable)}</span>
              <span className="text-[11px] text-stone-500 mt-1 block">Despesas da empresa</span>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Vencidos a Receber</span>
              <span className="text-2xl font-black text-orange-800 mt-1 block">{formatBRL(erpData.financial.overdueReceivable)}</span>
              <span className="text-[11px] text-stone-500 mt-1 block">Inadimplência ativa</span>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Comissões Pendentes</span>
              <span className="text-2xl font-black text-purple-800 mt-1 block">{formatBRL(erpData.financial.pendingCommissions)}</span>
              <span className="text-[11px] text-stone-500 mt-1 block">A pagar a vendedores</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-stone-200 flex justify-between items-center">
            <span className="text-xs text-stone-600 font-semibold">Deseja gerenciar lançamentos, DRE e caixa detalhado?</span>
            <Link href="/admin/financial" className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all">
              Abrir Módulo Financeiro
            </Link>
          </div>
        </div>
      )}

      {/* ABA PRODUÇÃO E ESTOQUE */}
      {activeTab === 'producao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Produtos para Venda</span>
              <span className="text-2xl font-black text-stone-900 mt-1 block">{erpData.products.forSale} itens</span>
              <span className="text-[11px] text-stone-500 mt-1 block">Catálogo ativo</span>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Insumos & Ingredientes</span>
              <span className="text-2xl font-black text-stone-900 mt-1 block">{erpData.products.supplies} itens</span>
              <span className="text-[11px] text-stone-500 mt-1 block">Matérias-primas</span>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 shadow-xs">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Estoque Abaixo do Mínimo</span>
              <span className="text-2xl font-black text-red-700 mt-1 block">{erpData.products.lowStock} itens</span>
              <span className="text-[11px] text-red-600 mt-1 block">Requer reposição urgente</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white border border-stone-200 flex justify-between items-center">
            <span className="text-xs text-stone-600 font-semibold">Controle de fichas técnicas e movimentações:</span>
            <Link href="/admin/stock" className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all">
              Abrir Controle de Estoque
            </Link>
          </div>
        </div>
      )}

      {/* ABA EXPANSÃO & LEADS */}
      {activeTab === 'crm' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl bg-white p-5 shadow-xs border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Leads Mapeados</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{crmData.summary.totalLeads}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                <Flame className="h-5 w-5" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-xs border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Clientes Cadastrados</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{erpData.customers.active}</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-xs border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Taxa de Conversão</span>
                <span className="text-2xl font-black text-amber-800 mt-1 block">{crmData.summary.conversionRate}%</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-xs border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Tempo Médio Conversão</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{crmData.summary.avgConversionTimeDays} dias</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-stone-200 flex justify-between items-center">
            <span className="text-xs text-stone-600 font-semibold">Deseja gerenciar a prospecção ativa de novos pontos?</span>
            <Link href="/admin/leads" className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all">
              Abrir Funil de Leads
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
