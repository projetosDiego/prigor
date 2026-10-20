'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, DollarSign, ShoppingCart } from 'lucide-react';

import { AgendaTab } from './agenda-tab';
import { CadastrosTab } from './cadastros-tab';
import { ComprasTab } from './compras-tab';
import { ExpenseModal } from './expense-modal';
import { api, btnGhost, btnPrimary, type AccountLite, type SupplierLite } from './fin-ui';
import { FluxoTab } from './fluxo-tab';
import LancamentosTab from './lancamentos-tab';
import { ResumoTab } from './resumo-tab';

export type TabKey = 'resumo' | 'receber' | 'pagar' | 'fluxo' | 'compras' | 'lancamentos' | 'cadastros';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'receber', label: 'A receber' },
  { key: 'pagar', label: 'A pagar' },
  { key: 'fluxo', label: 'Fluxo de caixa' },
  { key: 'compras', label: 'Compras' },
  { key: 'lancamentos', label: 'Lançamentos' },
  { key: 'cadastros', label: 'Contas e cadastros' },
];

export default function FinancialPage() {
  const [tab, setTab] = useState<TabKey>('resumo');
  const [version, setVersion] = useState(0);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [showExpense, setShowExpense] = useState(false);

  const loadRefs = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([api<AccountLite[]>('/api/finance/accounts'), api<SupplierLite[]>('/api/finance/suppliers')]);
      setAccounts(a);
      setSuppliers(s);
    } catch {
      /* listas auxiliares: a aba mostra o próprio erro quando precisar */
    }
  }, []);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    void loadRefs();
  }, [loadRefs]);

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight text-stone-900">
            <DollarSign className="h-6 w-6 text-amber-700" /> Financeiro & Caixa
          </h2>
          <p className="text-xs font-medium text-stone-500">Saldo, contas a pagar e receber, compras e a projeção do caixa em um só lugar.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => setTab('compras')}><ShoppingCart className="h-4 w-4" /> Nova compra</button>
          <button className={btnPrimary} onClick={() => setShowExpense(true)}><ArrowDownRight className="h-4 w-4" /> Nova despesa</button>
        </div>
      </div>

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold transition ${tab === t.key ? 'border-amber-600 text-amber-800' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'resumo' && <ResumoTab version={version} goto={setTab} />}
      {tab === 'receber' && <AgendaTab type="receita" version={version} accounts={accounts} onChanged={changed} />}
      {tab === 'pagar' && <AgendaTab type="despesa" version={version} accounts={accounts} onChanged={changed} onNewExpense={() => setShowExpense(true)} />}
      {tab === 'fluxo' && <FluxoTab version={version} goto={setTab} />}
      {tab === 'compras' && <ComprasTab version={version} accounts={accounts} suppliers={suppliers} reloadSuppliers={loadRefs} onChanged={changed} />}
      {tab === 'lancamentos' && <LancamentosTab />}
      {tab === 'cadastros' && <CadastrosTab accounts={accounts} suppliers={suppliers} reload={loadRefs} onChanged={changed} />}

      {showExpense && <ExpenseModal accounts={accounts} suppliers={suppliers} onClose={() => setShowExpense(false)} onSaved={changed} />}
    </div>
  );
}
