'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PieChart,
  Loader2,
  Printer,
  Download,
  Calendar,
  AlertTriangle,
  Search,
  Package,
  Sparkles,
  TrendingUp,
  Percent,
  Layers,
  ArrowUpDown
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { ProductAbcReport, ProductAbcRow } from '@/server/services/reports';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ProductsAbcReportPage() {
  const [data, setData] = useState<ProductAbcReport | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros locais
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');

  const setMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    setFrom(firstDay);
    setTo(today);
  };

  const setLast90Days = () => {
    const now = new Date();
    const past = new Date();
    past.setDate(past.getDate() - 90);
    setFrom(past.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  };

  const setAllTime = () => {
    setFrom('');
    setTo('');
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/reports/products-abc?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar Curva ABC.'));
      setData((json.data ?? json) as ProductAbcReport);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = data?.products ?? [];

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !searchTerm ||
        p.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category ?? '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchClass = classFilter === 'ALL' || p.classification === classFilter;
      return matchSearch && matchClass;
    });
  }, [products, searchTerm, classFilter]);

  const exportCsv = () => {
    if (!data) return;
    const sep = ';';
    const head = [
      'Classificação',
      'Produto',
      'Categoria',
      'Unidade',
      'Qtd Vendida',
      'Faturamento (R$)',
      'Participação (%)',
      'Acumulado (%)',
    ].join(sep);

    const body = filteredProducts
      .map((p) => [
        p.classification,
        `"${p.productName.replace(/"/g, '""')}"`,
        `"${(p.category ?? '').replace(/"/g, '""')}"`,
        p.unit,
        p.quantitySold,
        p.totalRevenue.toFixed(2).replace('.', ','),
        p.sharePercent.toFixed(2).replace('.', ','),
        p.cumulativeShare.toFixed(2).replace('.', ','),
      ].join(sep))
      .join('\n');

    const blob = new Blob(['\uFEFF' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curva-abc-produtos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <PieChart className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-black text-stone-900 tracking-tight">
              Curva ABC de Produtos & Giro
            </h2>
          </div>
          <p className="text-xs text-stone-500 font-medium mt-1">
            Classificação 80-15-5 de faturamento: descubra os doces essenciais da sua fábrica e evite rupturas de estoque
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
            disabled={!data || filteredProducts.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-stone-300" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4.5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
              Data Inicial
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-medium text-stone-800 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
              Data Final
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-medium text-stone-800 focus:outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
              Buscar Doce / Categoria
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="text"
                placeholder="Ex: Paçoca, Doce de Leite, Balas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50/50 font-medium text-stone-800 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">Atalhos:</span>
            <button
              onClick={setMonthRange}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              Este Mês
            </button>
            <button
              onClick={setLast90Days}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              Últimos 90 dias
            </button>
            <button
              onClick={setAllTime}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              Todo o Histórico
            </button>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => setClassFilter('ALL')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                classFilter === 'ALL' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Todos ({products.length})
            </button>
            <button
              onClick={() => setClassFilter('A')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                classFilter === 'A' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Classe A ({data?.summary.classA.count ?? 0})
            </button>
            <button
              onClick={() => setClassFilter('B')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                classFilter === 'B' ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Classe B ({data?.summary.classB.count ?? 0})
            </button>
            <button
              onClick={() => setClassFilter('C')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                classFilter === 'C' ? 'bg-stone-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-200'
              }`}
            >
              Classe C ({data?.summary.classC.count ?? 0})
            </button>
          </div>
        </div>
      </div>

      {/* Cards de Resumo ABC */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Classe A */}
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border-2 border-emerald-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Classe A • Campeões de Venda
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900">
              ~80% da Receita
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-black text-emerald-950">
                {brl(data?.summary.classA.total ?? 0)}
              </div>
              <div className="text-xs text-emerald-700 font-semibold mt-0.5">
                {data?.summary.classA.count ?? 0} produtos respondem por {data?.summary.classA.share.toFixed(1)}% do faturamento
              </div>
            </div>
          </div>
          <p className="text-[11px] text-emerald-800/80 mt-2">
            Produtos vitais: nunca deixe faltar matéria-prima nem estoque destes doces.
          </p>
        </div>

        {/* Classe B */}
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl border-2 border-amber-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-amber-600" />
              Classe B • Intermediários
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
              ~15% da Receita
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-black text-amber-950">
                {brl(data?.summary.classB.total ?? 0)}
              </div>
              <div className="text-xs text-amber-700 font-semibold mt-0.5">
                {data?.summary.classB.count ?? 0} produtos respondem por {data?.summary.classB.share.toFixed(1)}% do faturamento
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-800/80 mt-2">
            Giro moderado constante: manter estoque de segurança equilibrado.
          </p>
        </div>

        {/* Classe C */}
        <div className="bg-gradient-to-br from-stone-100 to-white rounded-2xl border-2 border-stone-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Package className="h-4 w-4 text-stone-500" />
              Classe C • Cauda Longa
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-stone-200 text-stone-800">
              ~5% da Receita
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-black text-stone-900">
                {brl(data?.summary.classC.total ?? 0)}
              </div>
              <div className="text-xs text-stone-600 font-semibold mt-0.5">
                {data?.summary.classC.count ?? 0} produtos respondem por {data?.summary.classC.share.toFixed(1)}% do faturamento
              </div>
            </div>
          </div>
          <p className="text-[11px] text-stone-500 mt-2">
            Baixo impacto financeiro: produzir sob encomenda ou em lotes mínimos.
          </p>
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <p className="text-xs text-stone-500 font-semibold">Calculando faturamento acumulado e curva ABC...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm">Falha ao gerar Curva ABC</h3>
            <p className="text-xs text-stone-500 mt-1">{error}</p>
            <button
              onClick={load}
              className="mt-3 px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-12 w-12 text-stone-300 mx-auto mb-3" />
            <h3 className="font-bold text-stone-900 text-sm">Nenhum produto encontrado</h3>
            <p className="text-xs text-stone-500 mt-1">
              Verifique o período selecionado ou termo de busca.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/70 text-stone-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5 text-center">Classe</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Qtd Vendida</th>
                  <th className="py-3 px-4 text-right">Faturamento Total</th>
                  <th className="py-3 px-5 text-right">% do Total</th>
                  <th className="py-3 px-5 text-right">% Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {filteredProducts.map((p, idx) => (
                  <tr key={p.productId} className="hover:bg-amber-50/20 transition-colors">
                    <td className="py-3.5 px-5 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-black text-xs ${
                          p.classification === 'A'
                            ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300/50'
                            : p.classification === 'B'
                            ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300/50'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {p.classification}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-stone-900 text-sm">{p.productName}</div>
                      <div className="text-[10px] text-stone-400 font-semibold">
                        Posição #{idx + 1} no ranking de receita
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-600 text-[10px] font-semibold">
                        {p.category || 'Geral'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-stone-800">
                      {p.quantitySold.toLocaleString('pt-BR')} {p.unit}
                    </td>

                    <td className="py-3.5 px-4 text-right font-black text-stone-900 text-sm">
                      {brl(p.totalRevenue)}
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <div className="font-black text-stone-800">{p.sharePercent}%</div>
                      <div className="w-20 bg-stone-100 rounded-full h-1.5 ml-auto mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.classification === 'A'
                              ? 'bg-emerald-500'
                              : p.classification === 'B'
                              ? 'bg-amber-500'
                              : 'bg-stone-400'
                          }`}
                          style={{ width: `${Math.min(100, p.sharePercent * 2)}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-right font-black text-stone-600">
                      {p.cumulativeShare}%
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
