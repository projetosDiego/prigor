'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw,
  TrendingUp, 
  Loader2, 
  Printer, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  Users, 
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { SellerProjectionReport, SellerProjectionRow } from '@/server/services/seller-projection';

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
  supervisorCommission: number;
  totalCommission: number;
  advancesTotal: number;
  allowance: number;
  netCommission: number;
  goal: number;
  projection: number;
  pctGoal: number;
  supervisorName: string | null;
  subordinatesCount: number;
  subordinatesSalesTotal: number;
  customers: CustomerSummary[];
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pctTxt = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

/** Projeção do mês de um vendedor (mês corrente, independente do período do relatório). */
function ProjectionPanel({ p, monthLabel, day, days }: { p: SellerProjectionRow; monthLabel: string; day: number; days: number }) {
  const tone = p.goal > 0 ? (p.projectedPctGoal >= 100 ? 'text-emerald-700' : p.projectedPctGoal >= 80 ? 'text-amber-700' : 'text-red-600') : 'text-stone-900';
  const Box = ({ label, value, sub, cls = 'text-stone-900' }: { label: string; value: string; sub?: string; cls?: string }) => (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-0.5 text-base font-black ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-stone-400">{sub}</div>}
    </div>
  );
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-stone-900">
          <TrendingUp className="h-4 w-4 text-amber-700" /> Projeção de {monthLabel}
        </h4>
        <span className="text-[10px] font-medium text-stone-500">dia {day} de {days} · ritmo recente = últimos 14 dias</span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Box label="Realizado no mês" value={brl0(p.realized)} sub={`${p.orders} pedido(s) · ticket ${brl0(p.averageTicket)}`} />
        <Box label="Projeção do mês" value={brl0(p.projectionMonth)} sub={`ritmo ${brl0(p.paceMonth)}/dia · recente ${brl0(p.projectionRecent)}`} cls="text-amber-800" />
        <Box
          label="Meta × projeção"
          value={p.goal > 0 ? `${p.projectedPctGoal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%` : 'sem meta'}
          sub={p.goal > 0 ? (p.missing > 0 ? `meta ${brl0(p.goal)} · falta ${brl0(p.missing)} (${brl0(p.neededPerDay)}/dia)` : `meta ${brl0(p.goal)} · batida`) : 'defina a meta em Vendedores'}
          cls={tone}
        />
        <Box label="vs mês anterior" value={pctTxt(p.projectedVsPrevPct)} sub={`mês ant. ${brl0(p.prevMonthRealized)}`} cls={p.projectedVsPrevPct !== null && p.projectedVsPrevPct < 0 ? 'text-red-600' : 'text-emerald-700'} />
        <Box label="Comissão projetada" value={brl(p.commissionProjected)} sub={`já ${brl(p.commissionRealized)}`} cls="text-emerald-700" />
        <Box label="A receber dos clientes" value={brl0(p.receivable.total)} sub={`${brl0(p.receivable.overdue)} atrasado · ${brl0(p.receivable.next30)} em 30d`} />
      </div>
    </div>
  );
}

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
  const [from, setFrom] = useState(() => toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => toLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'prevMonth' | 'custom'>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSellerId, setExpandedSellerId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [proj, setProj] = useState<SellerProjectionReport | null>(null);

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

  // Projeção do mês corrente (não depende do período escolhido acima).
  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch('/api/reports/seller-projection');
        const json = await res.json();
        if (res.ok && !cancel) setProj((json.data ?? json) as SellerProjectionReport);
      } catch {
        /* a projeção é complementar: o relatório segue sem ela */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);
  const projBySeller = new Map((proj?.rows ?? []).map((r) => [r.sellerId, r]));
  const projMonthLabel = proj
    ? new Date(Number(proj.month.split('-')[0]), Number(proj.month.split('-')[1]) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '';

  const totOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totRealized = rows.reduce((s, r) => s + r.realized, 0);
  const totCommission = rows.reduce((s, r) => s + (r.totalCommission ?? r.commission ?? 0), 0);
  const totAdvances = rows.reduce((s, r) => s + (r.advancesTotal ?? 0), 0);
  const totAllowance = rows.reduce((s, r) => s + (r.allowance ?? 0), 0);
  const totSupervisor = rows.reduce((s, r) => s + (r.supervisorCommission ?? 0), 0);
  const totNetCommission = rows.reduce((s, r) => s + (r.netCommission ?? 0), 0);
  const totGoal = rows.reduce((s, r) => s + r.goal, 0);
  const totProjection = rows.reduce((s, r) => s + r.projection, 0);
  const totPct = totGoal > 0 ? (totRealized / totGoal) * 100 : 0;

  /** Sem sellerId baixa o relatório geral; com sellerId, o fechamento individual. */
  const downloadPdf = async (sellerId?: string, sellerName?: string) => {
    const key = sellerId ?? '__all__';
    try {
      setDownloadingId(key);
      const params = new URLSearchParams();
      if (sellerId) params.set('sellerId', sellerId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/reports/sellers/pdf?${params.toString()}`);
      if (!res.ok) {
        let msg = 'Erro ao gerar o arquivo PDF.';
        try {
          const body = await res.json();
          msg = body?.error?.message ?? body?.detail ?? (typeof body?.error === 'string' ? body.error : msg);
        } catch {
          // resposta sem JSON
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sellerId
        ? `resumo_comissao_${(sellerName ?? 'vendedor').toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`
        : `relatorio-vendedores${from ? `-${from}` : ''}${to ? `-a-${to}` : ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const exportCsv = () => {
    const sep = ';';
    const head = ['Vendedor', 'Supervisor', 'Nº Pedidos', 'Realizado', 'Comissão Direta', 'Comissão Supervisão', 'Total Comissão', 'Adiantamentos', 'Líquido a Pagar', 'Meta', '% Meta'].join(sep);
    const n = (v: number) => v.toFixed(2).replace('.', ',');
    const body = rows
      .map((r) => [
        `"${r.sellerName.replace(/"/g, '""')}"`,
        `"${r.supervisorName || ''}"`,
        r.orders,
        n(r.realized),
        n(r.commission ?? 0),
        n(r.supervisorCommission ?? 0),
        n(r.totalCommission ?? 0),
        n(r.advancesTotal ?? 0),
        n(r.netCommission ?? 0),
        n(r.goal),
        r.pctGoal.toFixed(1).replace('.', ','),
      ].join(sep))
      .join('\r\n');
    const totals = [
      'TOTAL',
      '',
      totOrders,
      n(totRealized),
      '',
      '',
      n(totCommission),
      n(totAdvances),
      n(totNetCommission),
      n(totGoal),
      totPct.toFixed(1).replace('.', ','),
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

  const setPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'prevMonth') => {
    setActivePreset(preset);
    const d = new Date();
    if (preset === 'today') {
      setFrom(toLocalDate(d));
      setTo(toLocalDate(d));
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setFrom(toLocalDate(y));
      setTo(toLocalDate(y));
    } else if (preset === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 6);
      setFrom(toLocalDate(w));
      setTo(toLocalDate(d));
    } else if (preset === 'month') {
      setFrom(toLocalDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setTo(toLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else {
      setFrom(toLocalDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setTo(toLocalDate(new Date(d.getFullYear(), d.getMonth(), 0)));
    }
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
            Relatório de Vendedores & Supervisão
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Acompanhe vendas, comissão direta, bônus de supervisão, adiantamentos e gere o PDF de fechamento de cada vendedor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadPdf()}
            disabled={downloadingId === '__all__'}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer disabled:opacity-60"
          >
            <Printer className="h-4 w-4" /> {downloadingId === '__all__' ? 'Gerando PDF...' : 'Baixar PDF Geral'}
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer">
            <Download className="h-4 w-4 text-stone-500" /> Exportar CSV
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer">
            <Printer className="h-4 w-4 text-stone-500" /> Imprimir Relatório
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-stone-200 shadow-xs no-print">
        {([
          ['today', 'Hoje'],
          ['yesterday', 'Ontem'],
          ['week', 'Últimos 7 dias'],
          ['month', 'Este Mês'],
          ['prevMonth', 'Mês Anterior'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreset(key)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePreset === key ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="h-4 w-px bg-stone-200 mx-1 hidden sm:block" />
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-stone-700">
          <span>De:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setActivePreset('custom');
            }}
            className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-bold text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
          />
          <span>Até:</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setActivePreset('custom');
            }}
            className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-bold text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-700"
          />
        </div>
        <button
          type="button"
          onClick={load}
          title="Atualizar dados"
          disabled={loading}
          className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-700' : ''}`} />
        </button>
      </div>

      {/* Cards de Resumo Rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Total Faturado</span>
          <p className="text-xl font-black text-stone-900 mt-1">{brl(totRealized)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">{totOrders} pedido{totOrders === 1 ? '' : 's'} no período</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Comissão Total Bruta</span>
          <p className="text-xl font-black text-emerald-700 mt-1">{brl(totCommission)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Vendas diretas + supervisão</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Vales / Adiantamentos</span>
          <p className="text-xl font-black text-red-700 mt-1">{brl(totAdvances)}</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Adiantado aos vendedores</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-xs">
          <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wider">Líquido a Pagar</span>
          <p className="text-xl font-black text-emerald-850 mt-1">{brl(totNetCommission)}</p>
          <p className="text-[11px] text-emerald-750 font-bold mt-0.5">Comissão - vales + ajuda de custo</p>
        </div>
      </div>

      <div className="report-print rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-100 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-black text-stone-900">Metas, comissões, supervisão e fechamento por vendedor</h3>
            {period && <p className="text-xs text-stone-500">Período: {period.from} a {period.to}</p>}
          </div>
          <span className="text-[11px] text-stone-400 italic no-print">Clique no vendedor para ver os clientes ou gere o PDF individual</span>
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
                  <th className="py-3 px-5">Vendedor / Equipe</th>
                  <th className="py-3 px-3 text-center">Pedidos</th>
                  <th className="py-3 px-4 text-right">Realizado</th>
                  <th className="py-3 px-4 text-right text-emerald-700">Comissão Direta</th>
                  <th className="py-3 px-4 text-right text-amber-800">Supervisão</th>
                  <th className="py-3 px-4 text-right text-emerald-700">Ajuda de Custo</th>
                  <th className="py-3 px-4 text-right text-red-600">Adiantamentos</th>
                  <th className="py-3 px-4 text-right text-emerald-900 font-black">Líquido a Pagar</th>
                  <th className="py-3 px-4 text-right text-amber-800">Projeção do mês</th>
                  <th className="py-3 px-4 text-right">Meta</th>
                  <th className="py-3 px-3 text-center">% Meta</th>
                  <th className="py-3 px-4 text-center no-print">Ações &amp; PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {rows.length === 0 ? (
                  <tr><td colSpan={12} className="py-8 text-center text-stone-400">Nenhum vendedor ativo.</td></tr>
                ) : rows.map((r) => {
                  const isExpanded = expandedSellerId === r.sellerId;
                  const isGeneratingPdf = downloadingId === r.sellerId;
                  return (
                    <React.Fragment key={r.sellerId}>
                      <tr 
                        onClick={() => toggleExpand(r.sellerId)} 
                        className={`hover:bg-amber-50/40 cursor-pointer transition-colors ${isExpanded ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2">
                            <span className="text-stone-400 no-print">
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                            <div>
                              <span className="text-stone-850 font-bold text-sm block">{r.sellerName}</span>
                              {r.supervisorName ? (
                                <span className="text-[10px] text-stone-400 font-medium block">
                                  Supervisão: <strong>{r.supervisorName}</strong>
                                </span>
                              ) : r.subordinatesCount > 0 ? (
                                <span className="inline-block mt-0.5 text-[9px] font-black bg-amber-100 text-amber-850 px-1.5 py-0.2 rounded border border-amber-200">
                                  SUPERVISOR ({r.subordinatesCount} vendedores)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">{r.orders}</td>
                        <td className="py-3 px-4 text-right font-black text-stone-850">{brl(r.realized)}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">{brl(r.commission ?? 0)}</td>
                        <td className="py-3 px-4 text-right font-bold text-amber-850">
                          {r.supervisorCommission > 0 ? brl(r.supervisorCommission) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          {r.allowance > 0 ? `+ ${brl(r.allowance)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-red-600">
                          {r.advancesTotal > 0 ? `- ${brl(r.advancesTotal)}` : '0,00'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-block bg-emerald-50 text-emerald-800 font-black px-2 py-0.5 rounded border border-emerald-200 text-xs">
                            {brl(r.netCommission)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(() => {
                            const pr = projBySeller.get(r.sellerId);
                            if (!pr) return <span className="text-stone-300">—</span>;
                            return (
                              <>
                                <span className="font-black text-amber-800">{brl0(pr.projectionMonth)}</span>
                                {pr.goal > 0 && (
                                  <span className={`block text-[10px] font-bold ${pr.projectedPctGoal >= 100 ? 'text-emerald-600' : pr.projectedPctGoal >= 80 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {pr.projectedPctGoal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% da meta
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right text-stone-500">{r.goal > 0 ? brl(r.goal) : '—'}</td>
                        <td className="py-3 px-3">
                          {r.goal > 0 ? (
                            <span className="text-[10px] font-bold text-stone-600 block text-center">{r.pctGoal.toFixed(0)}%</span>
                          ) : <span className="text-stone-300 block text-center">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center no-print">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => downloadPdf(r.sellerId, r.sellerName)}
                              disabled={isGeneratingPdf}
                              className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[10px] flex items-center gap-1 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                              title="Gerar e Baixar Resumo em PDF deste vendedor"
                            >
                              {isGeneratingPdf ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                              <span>Gerar PDF</span>
                            </button>
                            <button 
                              type="button" 
                              onClick={() => toggleExpand(r.sellerId)}
                              className="text-[11px] font-bold text-stone-500 hover:text-stone-800 underline p-1"
                            >
                              {isExpanded ? 'Fechar' : 'Clientes'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Linha expansível com clientes e pedidos */}
                      {isExpanded && (
                        <tr className="bg-stone-50/60">
                          <td colSpan={12} className="p-4 sm:px-8 sm:py-5 border-b border-stone-200">
                            {proj && projBySeller.get(r.sellerId) && (
                              <div className="mb-4">
                                <ProjectionPanel p={projBySeller.get(r.sellerId)!} monthLabel={projMonthLabel} day={proj.total.daysElapsed} days={proj.daysInMonth} />
                              </div>
                            )}
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
                    <td className="py-3 px-5">TOTAL</td>
                    <td className="py-3 px-3 text-center">{totOrders}</td>
                    <td className="py-3 px-4 text-right">{brl(totRealized)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700">{brl(totCommission - totSupervisor)}</td>
                    <td className="py-3 px-4 text-right text-amber-800">{totSupervisor > 0 ? brl(totSupervisor) : '—'}</td>
                    <td className="py-3 px-4 text-right text-emerald-700">{totAllowance > 0 ? `+ ${brl(totAllowance)}` : '—'}</td>
                    <td className="py-3 px-4 text-right text-red-600">{totAdvances > 0 ? `- ${brl(totAdvances)}` : '0,00'}</td>
                    <td className="py-3 px-4 text-right text-emerald-900">{brl(totNetCommission)}</td>
                    <td className="py-3 px-4 text-right">{totGoal > 0 ? brl(totGoal) : '—'}</td>
                    <td className="py-3 px-3 text-center">{totGoal > 0 ? `${totPct.toFixed(0)}%` : '—'}</td>
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
