'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { 
  BarChart3, 
  Users, 
  Flame, 
  Award, 
  Clock, 
  Loader2,
  MapPin,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Package,
  Scale,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import type { DashboardStats } from '@/lib/api-types';

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

/**
 * Formata uma data civil (AAAA-MM-DD) como dd/mm/aaaa.
 * `new Date('2026-01-05')` seria interpretada como meia-noite UTC e voltaria
 * um dia atrás no fuso do Brasil, então a conversão é feita na mão.
 */
function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
}

export default function AdminDashboardPage() {
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [erpData, setErpData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Controle de abas
  const [activeTab, setActiveTab] = useState<'crm' | 'financeiro' | 'producao'>('crm');

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
    // A carga roda fora do corpo síncrono do efeito para não encadear
    // renders (react-hooks/set-state-in-effect).
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
        <p className="text-sm text-stone-500 font-medium">Consolidando informações do ecossistema...</p>
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
    <div className="space-y-8 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-700" />
            Dashboard Executivo
          </h2>
          <p className="text-xs text-stone-500 font-medium">Visão em tempo real da operação comercial, industrial e financeira</p>
        </div>
        
        {/* Filtro de Abas */}
        <div className="bg-stone-100 p-1 rounded-xl flex gap-1.5 self-start">
          <button 
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'crm' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-850'
            }`}
          >
            Comercial & CRM
          </button>
          <button 
            onClick={() => setActiveTab('financeiro')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'financeiro' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-850'
            }`}
          >
            Fluxo Financeiro
          </button>
          <button 
            onClick={() => setActiveTab('producao')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'producao' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-850'
            }`}
          >
            Estoque & Fábrica
          </button>
        </div>
      </div>

      {/* ABA COMERCIAL & CRM */}
      {activeTab === 'crm' && (
        <div className="space-y-8">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Oportunidades (Leads)</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{crmData.summary.totalLeads}</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                <Flame className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Clientes Cadastrados</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{erpData.customers.active}</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Users className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Taxa de Conversão</span>
                <span className="text-2xl font-black text-amber-800 mt-1 block">{crmData.summary.conversionRate}%</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Tempo Médio Conversão</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{crmData.summary.avgConversionTimeDays} dias</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* Funil de Prospecção */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 space-y-4">
            <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider">Funil de Prospecção Comercial</h3>
            <div className="grid grid-cols-11 gap-2 pt-2">
              {Object.entries(crmData.funnel).map(([stage, count]) => {
                const pct = crmData.summary.totalLeads > 0 ? (count / crmData.summary.totalLeads) * 100 : 0;
                return (
                  <div key={stage} className="flex flex-col items-center gap-2">
                    <div className="h-32 w-full bg-stone-50 flex flex-col justify-end rounded-lg overflow-hidden border border-stone-150 relative group">
                      <div 
                        className="bg-amber-700 w-full transition-all rounded-t-sm" 
                        style={{ height: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-stone-700">
                        {count}
                      </span>
                    </div>
                    <span 
                      className="text-[9px] font-bold text-stone-500 uppercase text-center w-full truncate cursor-default"
                      title={stage.replace('_', ' ')}
                    >
                      {stage.replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vendedores e Bairros */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="h-4.5 w-4.5 text-amber-700" />
                Performance dos Vendedores
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Vendedor</th>
                      <th className="pb-3 text-center">Leads Recebidos</th>
                      <th className="pb-3 text-center">Visitas</th>
                      <th className="pb-3 text-center">Conversões</th>
                      <th className="pb-3 text-center">Meta Mensal</th>
                      <th className="pb-3 text-right">Taxa Conversão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-semibold">
                    {crmData.sellerPerformance.map((seller) => (
                      <tr key={seller.id} className="hover:bg-stone-50/50">
                        <td className="py-3 font-bold text-stone-850">{seller.name}</td>
                        <td className="py-3 text-center text-stone-500">{seller.leadsReceived}</td>
                        <td className="py-3 text-center text-stone-500">{seller.visitsLogged}</td>
                        <td className="py-3 text-center font-bold text-emerald-700">{seller.conversions}</td>
                        <td className="py-3 text-center text-stone-450">{seller.goal}</td>
                        <td className="py-3 text-right font-black text-amber-800">{seller.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-4.5 w-4.5 text-amber-700" />
                Inteligência por Bairro
              </h3>
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {crmData.neighborhoodPerformance.map((n, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-stone-100 pb-2 text-xs font-semibold">
                    <div>
                      <span className="text-stone-850 block">{n.neighborhood}</span>
                      <span className="text-[10px] text-stone-450 font-medium">{n.totalLeads} oportunidades</span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-stone-700 block">{n.conversions} fechados</span>
                      <span className="text-[10px] text-amber-700 font-black">{n.conversionRate}% conv</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA FINANCEIRO & FLUXO DE CAIXA */}
      {activeTab === 'financeiro' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Caixa Financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Faturamento do Mês</span>
                <span className="text-2xl font-black text-emerald-800 mt-1 block">
                  {erpData.orders.monthGrossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">{erpData.orders.inMonth} vendas no período</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <ArrowUpRight className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Pedidos Em Aberto</span>
                <span className="text-2xl font-black text-amber-800 mt-1 block">
                  {erpData.orders.openValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">{erpData.orders.open} pedidos aguardando faturamento</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <Clock className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Contas a Receber</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">
                  {erpData.financial.receivable.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-stone-50 border border-stone-150 flex items-center justify-center text-stone-600">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Contas a Pagar</span>
                <span className="text-2xl font-black text-red-750 mt-1 block">
                  {erpData.financial.payable.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Inclui {erpData.financial.pendingCommissions.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de comissões</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-650">
                <ArrowDownRight className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* Últimos Pedidos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider">Últimos Pedidos Emitidos</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Pedido</th>
                      <th className="pb-3">Cliente</th>
                      <th className="pb-3">Data</th>
                      <th className="pb-3 text-center">Status</th>
                      <th className="pb-3 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                    {erpData.latestOrders.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50/50">
                        <td className="py-3 font-bold text-stone-850">#{p.numero}</td>
                        <td className="py-3 text-stone-700">{p.customerName}</td>
                        <td className="py-3 text-stone-450">{formatarData(p.orderDate)}</td>
                        <td className="py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            p.status === 'faturado' || p.status === 'entregue' ? 'bg-emerald-50 text-emerald-800' :
                            p.status === 'cancelado' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 text-right font-black text-stone-850">
                          {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumo de Projeção de Caixa */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider">Metas Financeiras</h3>
              
              <div className="space-y-6 pt-2">
                <div>
                  <div className="flex justify-between text-xs font-bold text-stone-650 mb-1">
                    <span>Faturamento Comercial</span>
                    <span>{((erpData.orders.monthGrossValue / 15000) * 100).toFixed(0)}% da Meta</span>
                  </div>
                  <div className="h-3 w-full bg-stone-100 rounded-full overflow-hidden border border-stone-150">
                    <div 
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${Math.min(100, (erpData.orders.monthGrossValue / 15000) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 font-medium block mt-1">Realizado: {erpData.orders.monthGrossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / Meta: R$ 15.000,00</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-stone-650 mb-1">
                    <span>Provisão de Caixa</span>
                    <span>Líquido Estimado</span>
                  </div>
                  <div className={`p-4 rounded-xl border font-bold text-sm ${
                    (erpData.financial.receivable - erpData.financial.payable) >= 0 ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-red-50/50 border-red-100 text-red-800'
                  }`}>
                    {(erpData.financial.receivable - erpData.financial.payable).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    <span className="text-[10px] text-stone-450 block font-medium mt-1">Saldo projetado após recebimento/pagamento das faturas pendentes.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA ESTOQUE & FÁBRICA */}
      {activeTab === 'producao' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Caixa Fábrica */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Produtos para Venda</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{erpData.products.forSale}</span>
                <span className="text-[10px] text-stone-400 font-medium">Produtos finais de brownie</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <Package className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Insumos & Ingredientes</span>
                <span className="text-2xl font-black text-stone-800 mt-1 block">{erpData.products.supplies}</span>
                <span className="text-[10px] text-stone-400 font-medium">Matérias-primas e recheios</span>
              </div>
              <div className="h-12 w-12 rounded-xl bg-stone-50 border border-stone-150 flex items-center justify-center text-stone-600">
                <Scale className="h-6 w-6" />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-sm border border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Rupturas / Estoque Baixo</span>
                <span className={`text-2xl font-black mt-1 block ${erpData.products.lowStock > 0 ? 'text-red-750' : 'text-emerald-800'}`}>
                  {erpData.products.lowStock}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Itens abaixo do estoque mínimo</span>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                erpData.products.lowStock > 0 ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-emerald-50 border border-emerald-100 text-emerald-600'
              }`}>
                {erpData.products.lowStock > 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              </div>
            </div>
          </div>

          {/* Top Vendidos e Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Produtos */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider">Produtos Mais Vendidos (Mês)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="pb-3">Produto</th>
                      <th className="pb-3 text-center">Quantidade Vendida</th>
                      <th className="pb-3 text-right">Valor Total Faturado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                    {erpData.topProducts.map((p, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="py-3 font-bold text-stone-850">{p.name}</td>
                        <td className="py-3 text-center text-stone-700 font-bold">{p.quantity} un</td>
                        <td className="py-3 text-right font-black text-stone-850">
                          {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                    {erpData.topProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-stone-400 font-medium">Sem dados de vendas registradas neste mês.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quadro de Alertas */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200 space-y-4">
              <h3 className="text-sm font-bold text-stone-800 uppercase tracking-wider">Ações Recomendadas</h3>
              
              <div className="space-y-3.5 pt-2 text-xs">
                {erpData.products.lowStock > 0 ? (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-800 rounded-xl flex items-start gap-2.5 font-semibold">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />
                    <div>
                      <span className="font-bold block">Aviso de Ruptura de Estoque</span>
                      <span className="text-[10px] text-red-700 font-medium block mt-0.5">Há {erpData.products.lowStock} ingredientes/produtos abaixo do limite de segurança. Vá para Matérias-primas para verificar o estoque mínimo.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-2.5 font-semibold">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <span className="font-bold block">Estoque 100% Seguro</span>
                      <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">Todos os insumos operacionais estão acima do estoque mínimo configurado.</span>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-stone-50 border border-stone-150 text-stone-700 rounded-xl flex items-start gap-2.5 font-semibold">
                  <Clock className="h-5 w-5 shrink-0 text-stone-500" />
                  <div>
                    <span className="font-bold block text-stone-850">Produção Programada</span>
                    <span className="text-[10px] text-stone-450 font-medium block mt-0.5">Acompanhe a fila de pedidos na tela de faturamento para planejar as fornadas e o derretimento do chocolate.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
