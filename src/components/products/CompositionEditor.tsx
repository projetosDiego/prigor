'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, Loader2, X } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';

interface Line {
  componentId: string;
  name: string;
  quantity: string;
}

/**
 * Composição do produto para os relatórios: "Display com 12" = 12 × "Brownie 7x5".
 * Salva por conta própria (não mexe em preço, estoque nem receita).
 */
export function CompositionEditor({ productId, products }: { productId: string; products: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState('');
  const [qty, setQty] = useState('1');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/components`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível carregar a composição.'));
      const json = (await res.json()) as Array<{ componentId: string; name: string; quantity: number }> | { data: Array<{ componentId: string; name: string; quantity: number }> };
      const arr = Array.isArray(json) ? json : json.data;
      setLines(arr.map((c) => ({ componentId: c.componentId, name: c.name, quantity: String(c.quantity) })));
      setDirty(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar composição.', 'error');
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function add() {
    const p = products.find((x) => x.id === pick);
    const q = Number(qty.replace(',', '.'));
    if (!p || !(q > 0)) return;
    setLines((cur) => [...cur.filter((l) => l.componentId !== p.id), { componentId: p.id, name: p.name, quantity: String(q) }]);
    setPick('');
    setQty('1');
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}/components`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components: lines.map((l) => ({ componentId: l.componentId, quantity: Number(l.quantity.replace(',', '.')) || 0 })).filter((l) => l.quantity > 0) }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível salvar a composição.'));
      toast('Composição salva.', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar composição.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 p-4 space-y-3 bg-stone-50/30">
      <h4 className="text-xs font-black text-stone-850 uppercase tracking-wider flex items-center gap-1">
        <Layers className="h-4 w-4 text-amber-700" />
        Composição (display / kit)
      </h4>
      <p className="text-[11px] text-stone-500">
        Para relatórios: informe de quais produtos este é feito. Ex.: Display com 12 = 12 × Brownie 7x5. As vendas dele passam a contar como unidades do brownie.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {lines.length > 0 && (
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {lines.map((l) => (
                <li key={l.componentId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <input
                    className="w-20 rounded-md border border-stone-200 px-2 py-1 text-right text-sm"
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => {
                      setLines((cur) => cur.map((x) => (x.componentId === l.componentId ? { ...x, quantity: e.target.value } : x)));
                      setDirty(true);
                    }}
                  />
                  <span className="text-stone-400">×</span>
                  <span className="flex-1 font-semibold text-stone-800">{l.name}</span>
                  <button
                    type="button"
                    className="text-stone-400 hover:text-red-500"
                    aria-label="Remover componente"
                    onClick={() => {
                      setLines((cur) => cur.filter((x) => x.componentId !== l.componentId));
                      setDirty(true);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-[9px] font-bold uppercase text-stone-400">Produto componente</label>
              <select className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Selecione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-[9px] font-bold uppercase text-stone-400">Quantidade</label>
              <input className="w-full rounded-lg border border-stone-300 px-2 py-2 text-right text-sm" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <button type="button" onClick={add} disabled={!pick} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40">
              Adicionar
            </button>
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-40">
              {saving ? 'Salvando…' : 'Salvar composição'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
