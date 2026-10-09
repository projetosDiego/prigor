'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Copy, Loader2, MessageCircle, RefreshCw } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { CollectionRowDTO, CollectionsDTO } from '@/server/services/collections';

type Filter = 'todos' | 'atrasado' | 'hoje' | 'proximo' | 'futuro';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const btn =
  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50';
const REMINDER_LABEL: Record<string, string> = {
  antes2: 'aviso −2 d',
  vencimento: 'aviso no dia',
  atraso3: 'cobrança +3 d',
  atraso7: 'cobrança +7 d',
};

function dueBadge(r: CollectionRowDTO) {
  if (r.daysLate > 0) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-black text-red-700">{r.daysLate} d atraso</span>;
  if (r.daysLate === 0) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">vence hoje</span>;
  return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">em {-r.daysLate} d</span>;
}

export default function CollectionsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<CollectionsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<Filter>('atrasado');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/collections');
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível carregar as cobranças.'));
      setData((await res.json()) as CollectionsDTO);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch('/api/collections/run', { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível executar.'));
      const r = (await res.json()) as {
        boletos: { checked?: number; paid?: number; writtenOff?: number; errors?: unknown[]; skipped?: string };
        reminders: { sent: number; skippedNoEmail: number; failed: number };
      };
      const bank = r.boletos.skipped
        ? `Banco não consultado (${r.boletos.skipped}).`
        : `${r.boletos.checked ?? 0} boleto(s) conferido(s), ${r.boletos.paid ?? 0} pago(s).`;
      toast(
        `${bank} ${r.reminders.sent} lembrete(s) enviado(s)` +
          (r.reminders.skippedNoEmail ? `, ${r.reminders.skippedNoEmail} cliente(s) sem e-mail` : '') +
          (r.reminders.failed ? `, ${r.reminders.failed} falha(s)` : '') +
          '.',
        r.reminders.failed || r.boletos.skipped ? 'info' : 'success',
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao executar.', 'error');
    } finally {
      setRunning(false);
    }
  }

  const rows = useMemo(() => (data ? data.rows.filter((r) => filter === 'todos' || r.bucket === filter) : []), [data, filter]);

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(ok, 'success');
    } catch {
      toast('Não foi possível copiar.', 'error');
    }
  }

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando cobranças…
      </div>
    );
  }

  const cards: Array<{ key: Filter; label: string; value: number; tone: string }> = [
    { key: 'atrasado', label: 'Em atraso', value: data.totals.atrasado, tone: 'text-red-600' },
    { key: 'hoje', label: 'Vence hoje', value: data.totals.hoje, tone: 'text-amber-600' },
    { key: 'proximo', label: 'Próximos 7 dias', value: data.totals.proximo, tone: 'text-stone-900' },
    { key: 'futuro', label: 'Mais adiante', value: data.totals.futuro, tone: 'text-stone-500' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-stone-900">
            <BellRing className="h-6 w-6 text-amber-600" /> Cobrança
          </h1>
          <p className="text-sm text-stone-500">
            A receber por vencimento. O sistema confere os boletos no banco, dá baixa nos pagos e avisa o cliente por e-mail (−2 dias, no dia, +3 e +7).
          </p>
        </div>
        <button className={btn} disabled={running} onClick={() => void run()}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Conferir banco e enviar lembretes
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-xl border bg-white p-4 text-left transition ${filter === c.key ? 'border-amber-500 ring-1 ring-amber-500' : 'border-stone-200 hover:border-stone-300'}`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{c.label}</div>
            <div className={`mt-1 text-2xl font-black ${c.tone}`}>{brl(c.value)}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 text-xs">
        <button onClick={() => setFilter('todos')} className={`rounded-full px-3 py-1 font-bold ${filter === 'todos' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
          Todos ({data.rows.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.transactionId} className="hover:bg-stone-50">
                <td className="px-4 py-2 font-semibold text-stone-900">
                  {r.customer}
                  {r.seller && <div className="text-[11px] font-normal text-stone-400">vendedor: {r.seller}</div>}
                </td>
                <td className="px-3 py-2 text-stone-700">
                  #{r.numero}
                  {!r.hasBoleto && <div className="text-[10px] text-stone-400">sem boleto</div>}
                </td>
                <td className="px-3 py-2">
                  {br(r.dueDate)} <span className="ml-1">{dueBadge(r)}</span>
                </td>
                <td className="px-3 py-2 text-right font-bold text-stone-900">{brl(r.value)}</td>
                <td className="px-3 py-2 text-xs text-stone-500">
                  {r.lastReminder ? REMINDER_LABEL[r.lastReminder] : r.hasBoleto ? (r.email ? 'aguardando' : 'sem e-mail') : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {r.phone ? (
                    <a
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      href={`https://wa.me/55${r.phone.replace(/^55/, '')}?text=${encodeURIComponent(r.whatsappText)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-stone-300">sem telefone</span>
                  )}
                  <button className="ml-1 rounded p-1.5 text-stone-500 hover:bg-stone-100" title="Copiar mensagem" onClick={() => void copy(r.whatsappText, 'Mensagem copiada.')}>
                    <Copy className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-400">
                  Nada nesta faixa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
