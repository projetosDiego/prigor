'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { api, br, brl, btnGhost, btnPrimary, CATEGORIES, Field, inputCls, Modal, parseMoney, todayIso, type AccountLite, type SupplierLite } from './fin-ui';

interface Recurring {
  id: string;
  description: string;
  category: string;
  value: number;
  dayOfMonth: number;
  supplier: string | null;
  active: boolean;
}

export function CadastrosTab({ accounts, suppliers, reload, onChanged }: { accounts: AccountLite[]; suppliers: SupplierLite[]; reload: () => void; onChanged: () => void }) {
  const { toast, confirm } = useToast();
  const [recurring, setRecurring] = useState<Recurring[] | null>(null);
  const [accModal, setAccModal] = useState<{ id: string | null; name: string; kind: string; balance: string; date: string; isDefault: boolean } | null>(null);
  const [checkAcc, setCheckAcc] = useState<AccountLite | null>(null);
  const [real, setReal] = useState('');
  const [supModal, setSupModal] = useState<{ name: string; document: string; phone: string } | null>(null);
  const [recModal, setRecModal] = useState<{ description: string; category: string; value: string; day: string; supplierId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRecurring = useCallback(async () => {
    try {
      setRecurring(await api<Recurring[]>('/api/finance/recurring'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring]);

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast(okMsg, 'success');
      reload();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const calc = checkAcc ? parseMoney(real) - checkAcc.balance : 0;

  return (
    <div className="space-y-6">
      {/* Contas */}
      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-black text-stone-800">Contas e bancos</h3>
            <p className="text-[11px] text-stone-500">O saldo parte do valor informado na data. Pix e boletos recebidos entram na conta padrão.</p>
          </div>
          <button className={btnPrimary} onClick={() => setAccModal({ id: null, name: '', kind: 'banco', balance: '', date: todayIso(), isDefault: accounts.length === 0 })}><Plus className="h-4 w-4" /> Nova conta</button>
        </div>
        {accounts.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">Cadastre seus bancos e o caixa em dinheiro, com o saldo de hoje.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {accounts.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${a.active ? '' : 'opacity-50'}`}>
                <div className="min-w-[10rem] flex-1">
                  <div className="text-sm font-bold text-stone-900">{a.name}{a.isDefault && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">padrão</span>}</div>
                  <div className="text-xs text-stone-500">saldo inicial {brl(a.openingBalance)} em {br(a.openingDate)}</div>
                </div>
                <div className={`text-lg font-black ${a.balance < 0 ? 'text-red-600' : 'text-stone-900'}`}>{brl(a.balance)}</div>
                <button className={btnGhost} onClick={() => { setCheckAcc(a); setReal(''); }}>Conferir saldo</button>
                {!a.isDefault && a.active && <button className="text-xs font-bold text-stone-500 hover:text-amber-700" onClick={() => void run(() => api(`/api/finance/accounts/${a.id}`, { method: 'PATCH', body: { isDefault: true } }), 'Conta padrão alterada.')}>tornar padrão</button>}
                <button className="text-xs font-bold text-stone-500 hover:text-red-600" onClick={() => void run(() => api(`/api/finance/accounts/${a.id}`, { method: 'PATCH', body: { active: !a.active } }), a.active ? 'Conta desativada.' : 'Conta reativada.')}>{a.active ? 'desativar' : 'reativar'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Despesas fixas */}
      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-black text-stone-800">Contas fixas (todo mês)</h3>
            <p className="text-[11px] text-stone-500">Aluguel, internet, salários… Em Contas a pagar, “Lançar contas fixas” cria o mês sem duplicar.</p>
          </div>
          <button className={btnPrimary} onClick={() => setRecModal({ description: '', category: 'Aluguel', value: '', day: '10', supplierId: '' })}><Plus className="h-4 w-4" /> Nova conta fixa</button>
        </div>
        {!recurring ? (
          <div className="flex h-20 items-center justify-center text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : recurring.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">Nenhuma conta fixa cadastrada.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recurring.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${r.active ? '' : 'opacity-50'}`}>
                <div className="min-w-[10rem] flex-1">
                  <div className="text-sm font-bold text-stone-900">{r.description}</div>
                  <div className="text-xs text-stone-500">{r.category} · todo dia {r.dayOfMonth}{r.supplier ? ` · ${r.supplier}` : ''}</div>
                </div>
                <div className="text-sm font-black text-stone-900">{brl(r.value)}</div>
                <button className="text-xs font-bold text-stone-500 hover:text-amber-700" onClick={() => void run(async () => { await api(`/api/finance/recurring/${r.id}`, { method: 'PATCH', body: { active: !r.active } }); await loadRecurring(); }, r.active ? 'Pausada.' : 'Reativada.')}>{r.active ? 'pausar' : 'reativar'}</button>
                <button className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir" onClick={async () => { if (await confirm({ title: 'Excluir conta fixa', message: `Excluir “${r.description}”? Lançamentos já criados continuam.`, confirmLabel: 'Excluir', danger: true })) void run(async () => { await api(`/api/finance/recurring/${r.id}`, { method: 'DELETE' }); await loadRecurring(); }, 'Conta fixa excluída.'); }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Fornecedores */}
      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h3 className="text-sm font-black text-stone-800">Fornecedores</h3>
          <button className={btnPrimary} onClick={() => setSupModal({ name: '', document: '', phone: '' })}><Plus className="h-4 w-4" /> Novo fornecedor</button>
        </div>
        {suppliers.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-500">Nenhum fornecedor cadastrado. Também dá para criar na hora de registrar uma compra.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {suppliers.map((s) => (
              <li key={s.id} className={`flex items-center gap-3 px-4 py-2.5 ${s.active ? '' : 'opacity-50'}`}>
                <div className="flex-1 text-sm"><span className="font-bold text-stone-900">{s.name}</span><span className="ml-2 text-xs text-stone-500">{[s.document, s.phone].filter(Boolean).join(' · ')}</span></div>
                <button className="text-xs font-bold text-stone-500 hover:text-red-600" onClick={() => void run(() => api(`/api/finance/suppliers/${s.id}`, { method: 'PATCH', body: { active: !s.active } }), s.active ? 'Fornecedor desativado.' : 'Fornecedor reativado.')}>{s.active ? 'desativar' : 'reativar'}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accModal && (
        <Modal title="Nova conta" onClose={() => setAccModal(null)}>
          <div className="space-y-3">
            <Field label="Nome"><input className={inputCls} placeholder="Ex.: Sicoob Doces Prigor" value={accModal.name} onChange={(e) => setAccModal({ ...accModal, name: e.target.value })} autoFocus /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tipo"><select className={inputCls} value={accModal.kind} onChange={(e) => setAccModal({ ...accModal, kind: e.target.value })}><option value="banco">Banco</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select></Field>
              <Field label="Saldo hoje (R$)"><input inputMode="decimal" className={inputCls} value={accModal.balance} onChange={(e) => setAccModal({ ...accModal, balance: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Na data"><input type="date" className={inputCls} value={accModal.date} onChange={(e) => setAccModal({ ...accModal, date: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={accModal.isDefault} onChange={(e) => setAccModal({ ...accModal, isDefault: e.target.checked })} /> Conta padrão (recebe Pix e boletos)</label>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setAccModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={busy || !accModal.name.trim()} onClick={() => void run(async () => { await api('/api/finance/accounts', { body: { name: accModal.name.trim(), kind: accModal.kind, openingBalance: parseMoney(accModal.balance), openingDate: accModal.date, isDefault: accModal.isDefault } }); setAccModal(null); }, 'Conta criada.')}>Salvar</button>
            </div>
          </div>
        </Modal>
      )}

      {checkAcc && (
        <Modal title={`Conferir saldo · ${checkAcc.name}`} onClose={() => setCheckAcc(null)}>
          <div className="space-y-3">
            <div className="rounded-lg bg-stone-50 p-3 text-sm">Pelo sistema: <strong>{brl(checkAcc.balance)}</strong></div>
            <Field label="Quanto aparece no banco/caixa agora? (R$)"><input inputMode="decimal" className={inputCls} value={real} onChange={(e) => setReal(e.target.value)} placeholder="0,00" autoFocus /></Field>
            {real.trim() !== '' && (
              <div className={`rounded-lg p-3 text-sm ${Math.abs(calc) < 0.005 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                {Math.abs(calc) < 0.005 ? 'Bateu! O saldo do sistema está igual ao real.' : <>Diferença de <strong>{brl(calc)}</strong>. Pode ser um pagamento ou recebimento que ainda não foi lançado. Se preferir só acertar o saldo, use o botão abaixo.</>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setCheckAcc(null)}>Fechar</button>
              <button className={btnPrimary} disabled={busy || real.trim() === '' || Math.abs(calc) < 0.005} onClick={() => void run(async () => { await api(`/api/finance/accounts/${checkAcc.id}`, { method: 'PATCH', body: { openingBalance: Math.round((checkAcc.openingBalance + calc) * 100) / 100 } }); setCheckAcc(null); }, 'Saldo ajustado.')}>Ajustar saldo para o real</button>
            </div>
          </div>
        </Modal>
      )}

      {supModal && (
        <Modal title="Novo fornecedor" onClose={() => setSupModal(null)}>
          <div className="space-y-3">
            <Field label="Nome"><input className={inputCls} value={supModal.name} onChange={(e) => setSupModal({ ...supModal, name: e.target.value })} autoFocus /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CNPJ/CPF (opcional)"><input className={inputCls} value={supModal.document} onChange={(e) => setSupModal({ ...supModal, document: e.target.value })} /></Field>
              <Field label="Telefone (opcional)"><input className={inputCls} value={supModal.phone} onChange={(e) => setSupModal({ ...supModal, phone: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setSupModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={busy || !supModal.name.trim()} onClick={() => void run(async () => { await api('/api/finance/suppliers', { body: { name: supModal.name.trim(), document: supModal.document.trim() || null, phone: supModal.phone.trim() || null } }); setSupModal(null); }, 'Fornecedor criado.')}>Salvar</button>
            </div>
          </div>
        </Modal>
      )}

      {recModal && (
        <Modal title="Nova conta fixa" onClose={() => setRecModal(null)}>
          <div className="space-y-3">
            <Field label="Descrição"><input className={inputCls} placeholder="Ex.: Aluguel da cozinha" value={recModal.description} onChange={(e) => setRecModal({ ...recModal, description: e.target.value })} autoFocus /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Categoria"><input className={inputCls} list="rec-cats" value={recModal.category} onChange={(e) => setRecModal({ ...recModal, category: e.target.value })} /><datalist id="rec-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Valor (R$)"><input inputMode="decimal" className={inputCls} value={recModal.value} onChange={(e) => setRecModal({ ...recModal, value: e.target.value })} /></Field>
              <Field label="Vence todo dia"><input inputMode="numeric" className={inputCls} value={recModal.day} onChange={(e) => setRecModal({ ...recModal, day: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></Field>
            </div>
            <Field label="Fornecedor (opcional)"><select className={inputCls} value={recModal.supplierId} onChange={(e) => setRecModal({ ...recModal, supplierId: e.target.value })}><option value="">—</option>{suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setRecModal(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={busy || !recModal.description.trim() || !(parseMoney(recModal.value) > 0) || !(Number(recModal.day) >= 1)} onClick={() => void run(async () => { await api('/api/finance/recurring', { body: { description: recModal.description.trim(), category: recModal.category, value: parseMoney(recModal.value), dayOfMonth: Number(recModal.day), supplierId: recModal.supplierId || null } }); setRecModal(null); await loadRecurring(); }, 'Conta fixa criada. Use “Lançar contas fixas” em Contas a pagar.')}>Salvar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
