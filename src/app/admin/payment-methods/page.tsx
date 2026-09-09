'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Plus, Edit2, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface FormaPagamento {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  netDays: number | null;
}

interface ListResponse {
  data?: FormaPagamento[];
}

export default function PaymentMethodsPage() {
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [prazoDias, setPrazoDias] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/payment-methods?activeOnly=false');
      const data: ListResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar formas de pagamento.'));
      setFormas(data.data ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setName('');
    setSortOrder(String((formas.at(-1)?.sortOrder ?? 0) + 1));
    setPrazoDias('');
    setActive(true);
    setShowForm(true);
  };

  const openEdit = (f: FormaPagamento) => {
    setEditId(f.id);
    setName(f.name);
    setSortOrder(String(f.sortOrder));
    setPrazoDias(f.netDays != null ? String(f.netDays) : '');
    setActive(f.active);
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editId ? `/api/payment-methods/${editId}` : '/api/payment-methods';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sortOrder: Number(sortOrder) || 0, active, netDays: prazoDias.trim() === '' ? null : Number(prazoDias) }),
      });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao salvar forma de pagamento.'));
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, nome: string) => {
    if (!confirm(`Desativar a forma de pagamento "${nome}"? Pedidos antigos não são afetados.`)) return;
    try {
      const res = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao desativar.'));
      await load();
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-amber-700" />
            Formas de Pagamento
          </h2>
          <p className="text-xs text-stone-500 font-medium">Formas disponíveis ao lançar um pedido. Crie, ordene e ative/desative.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nova Forma
        </button>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Carregando...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 text-xs text-center border border-red-200 rounded-xl">{error}</div>
      ) : (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-6">Ordem</th>
                <th className="py-3 px-6">Nome</th>
                <th className="py-3 px-6 text-center">Prazo</th>
                <th className="py-3 px-6 text-center">Situação</th>
                <th className="py-3 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
              {formas.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-stone-400">Nenhuma forma cadastrada.</td></tr>
              ) : formas.map((f) => (
                <tr key={f.id} className="hover:bg-stone-50/50">
                  <td className="py-3 px-6 text-stone-400">{f.sortOrder}</td>
                  <td className="py-3 px-6 text-stone-850 font-bold text-sm">{f.name}</td>
                  <td className="py-3 px-6 text-center text-stone-500">{f.netDays != null ? `${f.netDays} dia${f.netDays === 1 ? '' : 's'}` : '—'}</td>
                  <td className="py-3 px-6 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${f.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                      {f.active ? 'ATIVA' : 'DESATIVADA'}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openEdit(f)} className="p-1 text-stone-400 hover:text-amber-700 hover:bg-stone-50 rounded transition-all cursor-pointer"><Edit2 className="h-4 w-4" /></button>
                      {f.active && (
                        <button onClick={() => remove(f.id, f.name)} className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded transition-all cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">{editId ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</h3>
            <form onSubmit={save} className="space-y-4 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">Nome</label>
                <input type="text" placeholder="Ex: Fiado, Vale, PicPay..." value={name} onChange={(e) => setName(e.target.value)} required
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div>
                <label className="block mb-1">Ordem de exibição</label>
                <input type="number" min="0" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div>
                <label className="block mb-1">Prazo p/ vencimento (dias) — opcional</label>
                <input type="number" min="0" placeholder="Ex: 7 (boleto). Vazio = à vista" value={prazoDias} onChange={(e) => setPrazoDias(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                <p className="mt-1 text-[10px] text-stone-400 font-medium">Se preenchido, o vencimento do pedido é calculado a partir da previsão de entrega + esses dias.</p>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-150">
                <span>Ativa?</span>
                <button type="button" onClick={() => setActive(!active)} className="text-stone-500 hover:text-amber-800 cursor-pointer">
                  {active ? <ToggleRight className="h-8 w-8 text-amber-700" /> : <ToggleLeft className="h-8 w-8 text-stone-400" />}
                </button>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-650 hover:bg-stone-50 cursor-pointer">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer">{saving ? 'Gravando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
