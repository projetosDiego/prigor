'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { api, brl, CATEGORIES, Field, inputCls, btnGhost, btnPrimary, Modal, parseMoney, todayIso, type AccountLite, type SupplierLite } from './fin-ui';

/** Lançar uma despesa: à vista, já paga ou parcelada. */
export function ExpenseModal({ accounts, suppliers, onClose, onSaved }: { accounts: AccountLite[]; suppliers: SupplierLite[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Outros');
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [mode, setMode] = useState<'pendente' | 'paga' | 'parcelada'>('pendente');
  const [installments, setInstallments] = useState('2');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const total = parseMoney(value);
  const n = mode === 'parcelada' ? Math.max(2, Number(installments) || 2) : 1;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !(total > 0)) return;
    setSaving(true);
    try {
      await api('/api/finance/expenses', {
        body: {
          description: description.trim(),
          category,
          value: total,
          dueDate,
          installments: n,
          paid: mode === 'paga',
          paymentDate: mode === 'paga' ? dueDate : null,
          accountId: accountId || null,
          supplierId: supplierId || null,
          notes: notes.trim() || null,
        },
      });
      toast(n > 1 ? `${n} parcelas lançadas.` : mode === 'paga' ? 'Despesa lançada como paga.' : 'Despesa lançada em Contas a pagar.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao lançar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nova despesa" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="O que foi?">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Conta de luz, gasolina da entrega…" autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria">
            <input className={inputCls} list="fin-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="fin-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label={mode === 'parcelada' ? 'Valor total (R$)' : 'Valor (R$)'}>
            <input inputMode="decimal" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label={mode === 'paga' ? 'Data do pagamento' : mode === 'parcelada' ? 'Vencimento da 1ª parcela' : 'Vence em'}>
            <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Fornecedor (opcional)">
            <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {([['pendente', 'Vai pagar depois'], ['paga', 'Já paguei'], ['parcelada', 'Parcelada']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg border px-3 py-2 text-sm font-bold ${mode === k ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'parcelada' && (
          <Field label="Quantas parcelas?">
            <div className="flex items-center gap-3">
              <input inputMode="numeric" className={`${inputCls} w-24`} value={installments} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))} />
              {total > 0 && <span className="text-xs text-stone-500">{n}× de {brl(total / n)}, uma por mês</span>}
            </div>
          </Field>
        )}
        {accounts.length > 0 && (
          <Field label={mode === 'paga' ? 'Saiu de qual conta?' : 'Conta que vai pagar (opcional)'}>
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Conta padrão</option>
              {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Observações">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btnPrimary} disabled={saving || !description.trim() || !(total > 0)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lançar despesa
          </button>
        </div>
      </form>
    </Modal>
  );
}
