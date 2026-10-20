'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import type { PurchaseDTO } from '@/server/services/finance';
import { api, br, brl, btnGhost, btnPrimary, CATEGORIES, Field, inputCls, Modal, parseMoney, todayIso, type AccountLite, type SupplierLite } from './fin-ui';

interface Line {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}
const emptyLine = (): Line => ({ description: '', quantity: '1', unit: 'un', unitPrice: '' });

function PurchaseModal({ accounts, suppliers, onClose, onSaved, reloadSuppliers }: { accounts: AccountLite[]; suppliers: SupplierLite[]; onClose: () => void; onSaved: () => void; reloadSuppliers: () => void }) {
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [date, setDate] = useState(todayIso());
  const [document, setDocument] = useState('');
  const [category, setCategory] = useState('Ingredientes');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [mode, setMode] = useState<'pendente' | 'paga' | 'parcelada'>('pendente');
  const [installments, setInstallments] = useState('2');
  const [firstDue, setFirstDue] = useState(todayIso());
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => lines.reduce((s, l) => s + Math.round(parseMoney(l.quantity) * parseMoney(l.unitPrice) * 100), 0) / 100, [lines]);
  const n = mode === 'parcelada' ? Math.max(2, Number(installments) || 2) : 1;
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let sid = supplierId || null;
      if (!sid && newSupplier.trim()) {
        const s = await api<{ id: string }>('/api/finance/suppliers', { body: { name: newSupplier.trim() } });
        sid = s.id;
        reloadSuppliers();
      }
      await api('/api/finance/purchases', {
        body: {
          supplierId: sid,
          accountId: accountId || null,
          date,
          document: document.trim() || null,
          category,
          items: lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), quantity: parseMoney(l.quantity), unit: l.unit.trim() || null, unitPrice: parseMoney(l.unitPrice) })),
          installments: n,
          firstDue: mode === 'paga' ? date : firstDue,
          paid: mode === 'paga',
          notes: notes.trim() || null,
        },
      });
      toast(n > 1 ? `Compra registrada em ${n} parcelas.` : mode === 'paga' ? 'Compra registrada como paga.' : 'Compra registrada em Contas a pagar.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao registrar a compra.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nova compra" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fornecedor" className="sm:col-span-2">
            <div className="flex gap-2">
              <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— escolher —</option>
                {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!supplierId && <input className={inputCls} placeholder="ou digite um novo" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />}
            </div>
          </Field>
          <Field label="Data da compra"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Nº da nota (opcional)"><input className={inputCls} value={document} onChange={(e) => setDocument(e.target.value)} /></Field>
          <Field label="Categoria">
            <input className={inputCls} list="buy-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="buy-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>

        <div>
          <div className="mb-1 text-xs font-bold text-stone-600">Itens comprados</div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input className={`${inputCls} col-span-5`} placeholder="Ex.: Chocolate meio amargo 5kg" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input inputMode="decimal" className={`${inputCls} col-span-2`} placeholder="Qtd" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className={`${inputCls} col-span-1`} placeholder="un" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                <input inputMode="decimal" className={`${inputCls} col-span-2`} placeholder="Preço un." value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                <div className="col-span-1 text-right text-xs font-bold text-stone-700">{brl(parseMoney(l.quantity) * parseMoney(l.unitPrice))}</div>
                <button type="button" className="col-span-1 rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label="Remover item"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs font-bold text-amber-700 hover:underline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ Adicionar item</button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {([['pendente', 'Pagar depois'], ['paga', 'Já paguei'], ['parcelada', 'Parcelada']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${mode === k ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {mode !== 'paga' && <Field label={mode === 'parcelada' ? 'Vencimento da 1ª parcela' : 'Vence em'}><input type="date" className={inputCls} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></Field>}
          {mode === 'parcelada' && <Field label="Parcelas"><input inputMode="numeric" className={inputCls} value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))} /></Field>}
          {accounts.length > 0 && (
            <Field label={mode === 'paga' ? 'Saiu de qual conta?' : 'Conta (opcional)'}>
              <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Conta padrão</option>
                {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Observações"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

        <div className="flex items-center justify-between rounded-lg bg-stone-50 p-3">
          <div className="text-sm text-stone-600">Total da compra{n > 1 && total > 0 ? ` · ${n}× de ${brl(total / n)}` : ''}</div>
          <div className="text-xl font-black text-stone-900">{brl(total)}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btnPrimary} disabled={saving || total <= 0}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar compra</button>
        </div>
      </form>
    </Modal>
  );
}

export function ComprasTab({ version, accounts, suppliers, reloadSuppliers, onChanged }: { version: number; accounts: AccountLite[]; suppliers: SupplierLite[]; reloadSuppliers: () => void; onChanged: () => void }) {
  const { toast, confirm } = useToast();
  const [list, setList] = useState<PurchaseDTO[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<PurchaseDTO[]>('/api/finance/purchases'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar as compras.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, version]);

  async function remove(p: PurchaseDTO) {
    const ok = await confirm({ title: 'Excluir compra', message: `Excluir a compra de ${brl(p.total)}? As parcelas em aberto também são removidas.`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await api(`/api/finance/purchases/${p.id}`, { method: 'DELETE' });
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  if (!list)
    return (
      <div className="flex h-40 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
      </div>
    );

  const month = list.filter((p) => p.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Comprado neste mês</div>
          <div className="text-2xl font-black text-stone-900">{brl(month)}</div>
        </div>
        <button className={`${btnPrimary} ml-auto`} onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Nova compra</button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">Nenhuma compra registrada. Cadastre as compras de ingredientes e embalagens para saber quanto está gastando e com quem.</div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {list.map((p) => (
            <li key={p.id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button className="rounded p-1 text-stone-400 hover:bg-stone-100" onClick={() => setOpen(open === p.id ? null : p.id)} aria-label="Ver itens">{open === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm font-bold text-stone-900">{p.supplier ?? 'Sem fornecedor'}{p.document && <span className="ml-2 font-normal text-stone-400">NF {p.document}</span>}</div>
                  <div className="text-xs text-stone-500">{br(p.date)} · {p.category} · {p.items.length} item(ns)</div>
                </div>
                <div className="text-xs text-stone-500">{p.installments > 1 ? `${p.paidCount}/${p.installments} parcelas pagas` : p.paidCount ? 'paga' : 'a pagar'}</div>
                <div className="w-28 text-right text-sm font-black text-stone-900">{brl(p.total)}</div>
                <button className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" onClick={() => void remove(p)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
              </div>
              {open === p.id && (
                <div className="bg-stone-50 px-12 pb-3 text-xs text-stone-600">
                  {p.items.map((i, k) => (
                    <div key={k} className="flex justify-between py-0.5"><span>{i.quantity.toLocaleString('pt-BR')} {i.unit ?? ''} · {i.description}</span><span>{brl(i.total)}</span></div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showNew && <PurchaseModal accounts={accounts} suppliers={suppliers} onClose={() => setShowNew(false)} reloadSuppliers={reloadSuppliers} onSaved={() => { void load(); onChanged(); }} />}
    </div>
  );
}
