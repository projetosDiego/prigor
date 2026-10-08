'use client';

/**
 * Faturamento por CNPJ: notas e boletos emitidos por empresa no período,
 * faturamento do ano frente ao limite (MEI) e planilha para o contador.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Download, Landmark, Loader2, OctagonAlert, Receipt, RefreshCw,
} from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';

type Level = 'ok' | 'atencao' | 'critico' | 'estourado';
interface CountTotal { count: number; total: number }
interface IssuerBlock {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  annualLimit: number;
  invoices: { authorized: CountTotal; cancelled: CountTotal };
  boletos: { issued: CountTotal; paid: CountTotal; open: CountTotal; overdue: CountTotal; writtenOff: CountTotal };
  year: { invoiced: number; orders: number; projection: number; pct: number; level: Level; remaining: number };
}
interface Report {
  period: { from: string; to: string };
  year: number;
  issuers: IssuerBlock[];
  unassignedYear: CountTotal;
  invoices: {
    id: string; issuerName: string; date: string | null; number: number | null; series: number | null;
    status: string; orderNumero: number; customer: string; value: number;
  }[];
  boletos: {
    id: string; issuerName: string; issuedAt: string; dueDate: string; status: string;
    orderNumero: number; customer: string; value: number; paidAt: string | null;
  }[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const iso = (d: Date) => d.toISOString().slice(0, 10);

function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    mes: { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) },
    anterior: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    ano: { from: `${y}-01-01`, to: `${y}-12-31` },
  };
}

const LEVEL: Record<Level, { label: string; bar: string; text: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'Dentro do limite', bar: 'bg-emerald-600', text: 'text-emerald-700', Icon: CheckCircle2 },
  atencao: { label: 'Atenção: passou de 80%', bar: 'bg-amber-500', text: 'text-amber-700', Icon: AlertTriangle },
  critico: { label: 'Crítico: passou de 95%', bar: 'bg-red-600', text: 'text-red-700', Icon: OctagonAlert },
  estourado: { label: 'Limite ultrapassado', bar: 'bg-red-800', text: 'text-red-800', Icon: OctagonAlert },
};

const STATUS: Record<string, string> = {
  autorizada: 'Autorizada', cancelada: 'Cancelada', registrado: 'Em aberto', pago: 'Pago', baixado: 'Baixado',
};

function Tile({ label, value, sub, tone = 'text-stone-900' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`text-base font-black ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-500">{sub}</p>}
    </div>
  );
}

export default function IssuerReportPage() {
  const p = presets();
  const [from, setFrom] = useState(p.mes.from);
  const [to, setTo] = useState(p.mes.to);
  const [issuerId, setIssuerId] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qs = useCallback(
    () => new URLSearchParams({ from, to, ...(issuerId ? { issuerId } : {}) }).toString(),
    [from, to, issuerId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/issuers?${qs()}`);
      const d: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(d, 'Erro ao carregar o relatório.'));
      setData(d as Report);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (k: keyof ReturnType<typeof presets>) => {
    setFrom(p[k].from);
    setTo(p[k].to);
  };

  const input = 'px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500';
  const chip = 'px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs font-bold hover:bg-stone-50 cursor-pointer';

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" /> Faturamento por CNPJ
          </h1>
          <p className="text-xs text-stone-500 mt-1">Notas e boletos emitidos por empresa e quanto cada uma já faturou no ano.</p>
        </div>
        <a
          href={`/api/reports/issuers/csv?${qs()}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
        >
          <Download className="h-4 w-4" /> Baixar planilha (Excel)
        </a>
      </div>

      {/* Filtros: uma linha só */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-3">
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">De</label>
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Até</label>
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-stone-400 block mb-1">Empresa</label>
          <select className={input} value={issuerId} onChange={(e) => setIssuerId(e.target.value)}>
            <option value="">Todas</option>
            {(data?.issuers ?? []).map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={chip} onClick={() => applyPreset('mes')}>Este mês</button>
          <button type="button" className={chip} onClick={() => applyPreset('anterior')}>Mês passado</button>
          <button type="button" className={chip} onClick={() => applyPreset('ano')}>Este ano</button>
        </div>
        <button type="button" onClick={() => void load()} className={`${chip} inline-flex items-center gap-1`}>
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">{error}</p>}
      {loading && !data ? (
        <div className="flex justify-center p-12 text-stone-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : data ? (
        <>
          {data.unassignedYear.count > 0 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Em {data.year} há <strong>{data.unassignedYear.count} pedidos ({brl(data.unassignedYear.total)})</strong> sem
                CNPJ definido — eles não tiveram nota nem boleto, então não entram no faturamento de nenhuma empresa abaixo.
              </span>
            </p>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            {data.issuers.map((i) => {
              const lv = LEVEL[i.year.level];
              const width = Math.min(100, Math.max(0, i.year.pct));
              return (
                <section key={i.id} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="font-black text-stone-900">{i.name}</p>
                    <p className="text-[11px] text-stone-500">{i.legalName} · {fmtCnpj(i.cnpj)}</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-bold text-stone-700">Faturado em {data.year}</span>
                      <span className="text-stone-500">
                        <strong className="text-stone-900">{brl(i.year.orders)}</strong> de {brl(i.annualLimit)} ({i.year.pct.toLocaleString('pt-BR')}%)
                      </span>
                    </div>
                    <div
                      className="h-2.5 rounded-full bg-stone-100 overflow-hidden"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={i.annualLimit}
                      aria-valuenow={i.year.orders}
                      aria-label={`Faturamento de ${i.name} no ano`}
                    >
                      <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${width}%` }} />
                    </div>
                    <p className={`text-[11px] font-bold flex items-center gap-1 ${lv.text}`}>
                      <lv.Icon className="h-3.5 w-3.5" /> {lv.label}
                      <span className="font-normal text-stone-500">
                        {' '}· {i.year.remaining >= 0 ? `faltam ${brl(i.year.remaining)}` : `passou ${brl(-i.year.remaining)}`}
                        {' '}· no ritmo atual fecha o ano em ~{brl(i.year.projection)}
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <Tile label="NF autorizadas" value={brl(i.invoices.authorized.total)} sub={`${i.invoices.authorized.count} notas no período`} />
                    <Tile label="NF canceladas" value={String(i.invoices.cancelled.count)} sub={brl(i.invoices.cancelled.total)} tone="text-stone-500" />
                    <Tile label="Boletos emitidos" value={brl(i.boletos.issued.total)} sub={`${i.boletos.issued.count} boletos`} />
                    <Tile label="Boletos pagos" value={brl(i.boletos.paid.total)} sub={`${i.boletos.paid.count} pagos`} tone="text-emerald-700" />
                    <Tile label="Em aberto" value={brl(i.boletos.open.total)} sub={`${i.boletos.open.count} boletos`} tone="text-amber-700" />
                    <Tile
                      label="Vencidos"
                      value={brl(i.boletos.overdue.total)}
                      sub={`${i.boletos.overdue.count} boletos`}
                      tone={i.boletos.overdue.count ? 'text-red-700' : 'text-stone-500'}
                    />
                  </div>
                </section>
              );
            })}
          </div>

          <section className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <h2 className="px-4 py-3 text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-stone-100">
              <Receipt className="h-4 w-4" /> Notas fiscais no período ({data.invoices.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Data</th><th className="text-left px-2 py-2">NF</th>
                    <th className="text-left px-2 py-2">Empresa</th><th className="text-left px-2 py-2">Pedido</th>
                    <th className="text-left px-2 py-2">Cliente</th><th className="text-right px-2 py-2">Valor</th>
                    <th className="text-left px-4 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-400">Nenhuma nota no período.</td></tr>
                  ) : (
                    data.invoices.map((n) => (
                      <tr key={n.id} className="border-t border-stone-100">
                        <td className="px-4 py-2">{br(n.date)}</td>
                        <td className="px-2 py-2 font-bold">{n.number ?? '—'}{n.series != null ? `/${n.series}` : ''}</td>
                        <td className="px-2 py-2">{n.issuerName}</td>
                        <td className="px-2 py-2">#{n.orderNumero}</td>
                        <td className="px-2 py-2">{n.customer}</td>
                        <td className="px-2 py-2 text-right font-bold">{brl(n.value)}</td>
                        <td className={`px-4 py-2 ${n.status === 'cancelada' ? 'text-stone-400 line-through' : 'text-emerald-700'}`}>{STATUS[n.status] ?? n.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <h2 className="px-4 py-3 text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-stone-100">
              <Landmark className="h-4 w-4" /> Boletos emitidos no período ({data.boletos.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Emissão</th><th className="text-left px-2 py-2">Vencimento</th>
                    <th className="text-left px-2 py-2">Empresa</th><th className="text-left px-2 py-2">Pedido</th>
                    <th className="text-left px-2 py-2">Cliente</th><th className="text-right px-2 py-2">Valor</th>
                    <th className="text-left px-4 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.boletos.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-400">Nenhum boleto no período.</td></tr>
                  ) : (
                    data.boletos.map((b) => {
                      const overdue = b.status === 'registrado' && b.dueDate < iso(new Date());
                      return (
                        <tr key={b.id} className="border-t border-stone-100">
                          <td className="px-4 py-2">{br(b.issuedAt)}</td>
                          <td className={`px-2 py-2 ${overdue ? 'text-red-700 font-bold' : ''}`}>{br(b.dueDate)}</td>
                          <td className="px-2 py-2">{b.issuerName}</td>
                          <td className="px-2 py-2">#{b.orderNumero}</td>
                          <td className="px-2 py-2">{b.customer}</td>
                          <td className="px-2 py-2 text-right font-bold">{brl(b.value)}</td>
                          <td className="px-4 py-2">
                            {b.status === 'pago' ? <span className="text-emerald-700">Pago em {br(b.paidAt)}</span>
                              : overdue ? <span className="text-red-700 font-bold">Vencido</span>
                              : <span className={b.status === 'baixado' ? 'text-stone-400' : 'text-amber-700'}>{STATUS[b.status] ?? b.status}</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
