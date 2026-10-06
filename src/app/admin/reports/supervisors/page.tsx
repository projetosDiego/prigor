'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  UserSquare2,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Printer,
  Users,
  Wallet,
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';
import type { SupervisorsReportDTO, SupervisorPaymentReport, Trend } from '@/server/services/supervisor-report';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const signedPct = (n: number | null) =>
  n === null
    ? '—'
    : `${n >= 0 ? '+' : '-'}${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const TREND_STYLE: Record<Trend, { text: string; badge: string; label: string }> = {
  up: { text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Crescimento' },
  new: { text: 'text-emerald-700', badge: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Retomou vendas' },
  down: { text: 'text-red-600', badge: 'bg-red-50 border-red-200 text-red-700', label: 'Queda' },
  flat: { text: 'text-stone-500', badge: 'bg-stone-50 border-stone-200 text-stone-600', label: 'Estável' },
};

function TrendIcon({ trend, className }: { trend: Trend; className?: string }) {
  if (trend === 'up' || trend === 'new') return <TrendingUp className={className} />;
  if (trend === 'down') return <TrendingDown className={className} />;
  return <Minus className={className} />;
}

export default function SupervisorReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<SupervisorsReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/reports/supervisors?year=${year}&month=${month}`);
      const body = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(body, 'Erro ao carregar o relatório do supervisor.'));
      setData(body as SupervisorsReportDTO);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const downloadPdf = async (s: SupervisorPaymentReport) => {
    try {
      setDownloadingId(s.supervisorId);
      const res = await fetch(`/api/reports/supervisors/pdf?supervisorId=${s.supervisorId}&year=${year}&month=${month}`);
      if (!res.ok) {
        let msg = 'Erro ao gerar o PDF do supervisor.';
        try {
          const body = await res.json();
          msg = body?.error?.message ?? body?.detail ?? msg;
        } catch {
          // resposta sem JSON
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagamento_supervisor_${s.supervisorName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year}-${String(month).padStart(2, '0')}.pdf`;
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
          <UserSquare2 className="h-6 w-6 text-amber-700" />
          Relatório do Supervisor — Pagamento
        </h2>
        <p className="text-xs text-stone-500 font-medium">
          Quanto cada vendedor da equipe vendeu, quantos clientes atendeu, o valor a pagar ao supervisor e a evolução da equipe nos últimos meses.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm">
        <div>
          <label className="block text-[10px] text-stone-400 font-bold uppercase mb-1">Mês de Referência</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 cursor-pointer"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-400 font-bold uppercase mb-1">Ano</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-stone-500 font-medium ml-auto self-center">
          Fechamento de <span className="font-bold text-stone-800">{MESES[month - 1]} de {year}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">{error}</div>
      ) : !data || data.supervisors.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Nenhum supervisor encontrado. Para um vendedor virar supervisor, edite os vendedores da equipe e escolha o supervisor
          (e o % de supervisão) no cadastro.
        </div>
      ) : (
        data.supervisors.map((s) => {
          const style = TREND_STYLE[s.verdict.trend];
          const maxSales = Math.max(...s.history.map((h) => h.sales), 1);
          return (
            <section key={s.supervisorId} className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4">
                <div>
                  <h3 className="text-lg font-black text-stone-900">{s.supervisorName}</h3>
                  <p className="text-[11px] text-stone-500 font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {s.subordinates.length} vendedor(es) supervisionado(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadPdf(s)}
                  disabled={downloadingId === s.supervisorId}
                  className="px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {downloadingId === s.supervisorId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  PDF de Pagamento
                </button>
              </header>

              {/* Resumo do pagamento */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-5">
                <div className="rounded-xl border border-stone-200 p-3">
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Comissão de Supervisão</span>
                  <p className="text-lg font-black text-amber-800 mt-1">{brl(s.payment.supervisionCommission)}</p>
                  <p className="text-[10px] text-stone-400">Sobre vendas da equipe</p>
                </div>
                <div className="rounded-xl border border-stone-200 p-3">
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Comissão Própria</span>
                  <p className="text-lg font-black text-stone-900 mt-1">{brl(s.payment.ownCommission)}</p>
                  <p className="text-[10px] text-stone-400">Vendas da própria carteira</p>
                </div>
                <div className="rounded-xl border border-stone-200 p-3">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Ajuda de Custo</span>
                  <p className="text-lg font-black text-emerald-700 mt-1">{s.payment.allowance > 0 ? `+${brl(s.payment.allowance)}` : '—'}</p>
                  <p className="text-[10px] text-stone-400">Valor fixo mensal</p>
                </div>
                <div className="rounded-xl border border-stone-200 p-3">
                  <span className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Adiantamentos</span>
                  <p className="text-lg font-black text-red-600 mt-1">{s.payment.advances > 0 ? `-${brl(s.payment.advances)}` : '—'}</p>
                  <p className="text-[10px] text-stone-400">Abatidos da comissão</p>
                </div>
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-3 col-span-2 lg:col-span-1">
                  <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wider flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" /> Líquido a Pagar
                  </span>
                  <p className="text-xl font-black text-emerald-900 mt-1">{brl(s.payment.net)}</p>
                  <p className="text-[10px] text-emerald-800/80 font-medium">Mesmo valor do fechamento individual</p>
                </div>
              </div>

              {/* Equipe */}
              <div className="px-5 pb-5">
                <h4 className="text-xs font-black text-stone-700 uppercase tracking-wider mb-2">
                  Equipe em {MESES[month - 1]}
                </h4>
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-4">Vendedor</th>
                        <th className="py-2.5 px-4 text-center">Clientes atendidos</th>
                        <th className="py-2.5 px-4 text-center">Pedidos</th>
                        <th className="py-2.5 px-4 text-right">Vendeu</th>
                        <th className="py-2.5 px-4 text-right">% Supervisão</th>
                        <th className="py-2.5 px-4 text-right text-amber-800">Comissão do Supervisor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                      {s.subordinates.length === 0 ? (
                        <tr><td colSpan={6} className="py-5 text-center text-stone-400">Nenhum vendedor vinculado.</td></tr>
                      ) : (
                        s.subordinates.map((sub) => (
                          <tr key={sub.sellerId}>
                            <td className="py-2.5 px-4 font-bold text-stone-850">{sub.sellerName}</td>
                            <td className="py-2.5 px-4 text-center">{sub.customers}</td>
                            <td className="py-2.5 px-4 text-center">{sub.orders}</td>
                            <td className="py-2.5 px-4 text-right">{brl(sub.sales)}</td>
                            <td className="py-2.5 px-4 text-right text-stone-500">{sub.supervisorPct.toLocaleString('pt-BR')}%</td>
                            <td className="py-2.5 px-4 text-right font-bold text-amber-800">{brl(sub.supervisorCommission)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-stone-200 bg-stone-50 font-black text-stone-900">
                        <td className="py-2.5 px-4">TOTAL DA EQUIPE</td>
                        <td className="py-2.5 px-4 text-center">{s.team.customers}</td>
                        <td className="py-2.5 px-4 text-center">{s.team.orders}</td>
                        <td className="py-2.5 px-4 text-right">{brl(s.team.sales)}</td>
                        <td className="py-2.5 px-4" />
                        <td className="py-2.5 px-4 text-right text-amber-800">{brl(s.team.commission)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Evolução */}
              <div className="border-t border-stone-200 bg-stone-50/50 px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-xs font-black text-stone-700 uppercase tracking-wider">
                    Evolução da equipe — últimos {s.history.length} meses
                  </h4>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-black ${style.badge}`}>
                    <TrendIcon trend={s.verdict.trend} className="h-3.5 w-3.5" />
                    {style.label}
                    {s.verdict.changePct !== null && ` ${signedPct(s.verdict.changePct)}`}
                  </span>
                </div>
                <p className={`text-xs font-bold mb-4 ${style.text}`}>{s.verdict.text}</p>

                <div className="grid grid-cols-6 gap-2 items-end h-36 mb-4">
                  {s.history.map((h) => (
                    <div key={`${h.year}-${h.month}`} className="flex flex-col items-center justify-end h-full gap-1">
                      <span className={`text-[10px] font-black ${TREND_STYLE[h.trend].text}`}>{h.trend === 'new' ? 'novo' : signedPct(h.changePct)}</span>
                      <div
                        className="w-full max-w-[44px] rounded-t-md bg-amber-600/80"
                        style={{ height: `${Math.max((h.sales / maxSales) * 100, h.sales > 0 ? 4 : 1)}%` }}
                        title={`${h.label}: ${brl(h.sales)}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-4">Mês</th>
                        <th className="py-2.5 px-4 text-right">Vendas da equipe</th>
                        <th className="py-2.5 px-4 text-right">Variação</th>
                        <th className="py-2.5 px-4 text-center">Pedidos</th>
                        <th className="py-2.5 px-4 text-center">Clientes</th>
                        <th className="py-2.5 px-4 text-right">Comissão de supervisão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                      {s.history.map((h) => (
                        <tr key={`${h.year}-${h.month}`}>
                          <td className="py-2 px-4 font-bold text-stone-850">{h.label}</td>
                          <td className="py-2 px-4 text-right">{brl(h.sales)}</td>
                          <td className={`py-2 px-4 text-right font-black ${TREND_STYLE[h.trend].text}`}>
                            <span className="inline-flex items-center gap-1">
                              <TrendIcon trend={h.trend} className="h-3.5 w-3.5" />
                              {h.trend === 'new' ? 'retomou' : signedPct(h.changePct)}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-center">{h.orders}</td>
                          <td className="py-2 px-4 text-center">{h.customers}</td>
                          <td className="py-2 px-4 text-right">{brl(h.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
