'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Repeat } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import type { AgendaItem } from '@/server/services/finance';
import { api, br, brl, btnGhost, btnPrimary, Field, inputCls, Modal, todayIso, type AccountLite } from './fin-ui';

type Group = { key: string; title: string; tone: string; items: AgendaItem[] };

function group(items: AgendaItem[]): Group[] {
  const g: Group[] = [
    { key: 'late', title: 'Vencidas', tone: 'text-red-700', items: [] },
    { key: 'today', title: 'Vencem hoje', tone: 'text-amber-700', items: [] },
    { key: 'week', title: 'Próximos 7 dias', tone: 'text-stone-800', items: [] },
    { key: 'month', title: 'Próximos 30 dias', tone: 'text-stone-800', items: [] },
    { key: 'later', title: 'Mais para frente', tone: 'text-stone-500', items: [] },
  ];
  for (const i of items) {
    const d = i.daysLate;
    const idx = d > 0 ? 0 : d === 0 ? 1 : d >= -7 ? 2 : d >= -30 ? 3 : 4;
    g[idx]!.items.push(i);
  }
  return g.filter((x) => x.items.length);
}

export function AgendaTab({ type, version, accounts, onChanged, onNewExpense }: { type: 'receita' | 'despesa'; version: number; accounts: AccountLite[]; onChanged: () => void; onNewExpense?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<AgendaItem[] | null>(null);
  const [paying, setPaying] = useState<AgendaItem | null>(null);
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: AgendaItem[] }>(`/api/finance/agenda?type=${type}`);
      setItems(d.items);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar.', 'error');
    }
  }, [type, toast]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const groups = useMemo(() => group(items ?? []), [items]);
  const total = (items ?? []).reduce((s, i) => s + i.value, 0);
  const isPay = type === 'despesa';

  async function generateRecurring() {
    setGenerating(true);
    try {
      const r = await api<{ created: number }>('/api/finance/recurring/generate', { body: {} });
      toast(r.created ? `${r.created} despesa(s) fixa(s) lançada(s) para este e o próximo mês.` : 'Nada novo: as despesas fixas já estão lançadas.', r.created ? 'success' : 'info');
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao gerar.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function confirmPay() {
    if (!paying) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ paymentDate: date });
      if (accountId) qs.set('accountId', accountId);
      await api(`/api/financial/transactions/${paying.id}/settle?${qs.toString()}`, { body: {} });
      toast(isPay ? 'Pagamento registrado.' : 'Recebimento registrado.', 'success');
      setPaying(null);
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao baixar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!items)
    return (
      <div className="flex h-40 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{isPay ? 'Total a pagar' : 'Total a receber'}</div>
          <div className={`text-2xl font-black ${isPay ? 'text-red-700' : 'text-emerald-800'}`}>{brl(total)}</div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {isPay && (
            <>
              <button className={btnGhost} disabled={generating} onClick={() => void generateRecurring()} title="Lança as contas fixas cadastradas (aluguel, internet…) deste e do próximo mês">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />} Lançar contas fixas
              </button>
              <button className={btnPrimary} onClick={onNewExpense}>
                <Plus className="h-4 w-4" /> Nova despesa
              </button>
            </>
          )}
        </div>
      </div>

      {groups.length === 0 && <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">{isPay ? 'Nenhuma conta a pagar. Lance despesas ou compras para acompanhar aqui.' : 'Nada a receber no momento.'}</div>}

      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2">
            <h3 className={`text-sm font-black ${g.tone}`}>{g.title} ({g.items.length})</h3>
            <span className="text-sm font-black text-stone-700">{brl(g.items.reduce((s, i) => s + i.value, 0))}</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {g.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm font-semibold text-stone-900">
                    {i.who ?? i.description}
                    {i.orderNumero !== null && <span className="ml-2 font-normal text-stone-400">#{i.orderNumero}</span>}
                    {i.recurring && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">fixa</span>}
                  </div>
                  <div className="text-xs text-stone-500">{i.who ? `${i.description} · ` : ''}{i.category ?? 'Sem categoria'}</div>
                </div>
                <div className="text-xs text-stone-500">{br(i.dueDate)}{i.daysLate > 0 && <span className="ml-1 font-black text-red-600">{i.daysLate}d atraso</span>}</div>
                <div className="w-28 text-right text-sm font-black text-stone-900">{brl(i.value)}</div>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50" onClick={() => { setPaying(i); setDate(todayIso()); setAccountId(''); }}>
                  <CheckCircle2 className="h-4 w-4" /> {isPay ? 'Paguei' : 'Recebi'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {paying && (
        <Modal title={isPay ? 'Registrar pagamento' : 'Registrar recebimento'} onClose={() => setPaying(null)}>
          <div className="space-y-3">
            <div className="rounded-lg bg-stone-50 p-3 text-sm">
              <div className="font-bold text-stone-900">{paying.who ?? paying.description}</div>
              <div className="text-stone-600">{brl(paying.value)} · vence {br(paying.dueDate)}</div>
            </div>
            <Field label={isPay ? 'Pago em' : 'Recebido em'}>
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {accounts.length > 0 && (
              <Field label={isPay ? 'Saiu de qual conta?' : 'Entrou em qual conta?'}>
                <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Conta padrão</option>
                  {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setPaying(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={busy} onClick={() => void confirmPay()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
              </button>
            </div>
            {!isPay && <p className="text-[11px] text-stone-400">Para recebimentos de clientes com boleto ou Pix, prefira a tela de Cobrança, que também cancela o boleto no banco.</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
