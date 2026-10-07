'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Copy,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
  Zap,
  Flame,
  UserRound,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import { computePricing, markupForTargetMargin } from '@/server/domain/precificacao';
import type {
  FixedCostDTO,
  IngredientDTO,
  PricingBundleDTO,
  ResourceDTO,
  SheetDTO,
} from '@/server/services/precificacao';

type Tab = 'fichas' | 'insumos' | 'recursos' | 'custos';
type Kind = 'produto' | 'massa' | 'recheio';

const brl = (v: number, digits = 2) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });
const dec = (v: number, max = 4) => v.toLocaleString('pt-BR', { maximumFractionDigits: max });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const toNum = (s: string | number): number => {
  if (typeof s === 'number') return s;
  const t = String(s).trim();
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
};

const CATEGORIES: Record<string, string> = {
  materia_prima: 'Matéria-prima',
  embalagem: 'Embalagem',
  base_recheio: 'Base / Recheio pronto',
  outros: 'Outros',
};
const KIND_LABEL: Record<Kind, string> = { produto: 'Produtos', massa: 'Massas', recheio: 'Recheios' };
const RES_LABEL = { eletrico: 'Elétrico', gas: 'A gás', mao_de_obra: 'Mão de obra' } as const;

const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50';

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível concluir a operação.'));
  return (await res.json()) as T;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} rounded-2xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h3 className="text-base font-black text-stone-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-stone-400">{hint}</span>}
    </label>
  );
}

export default function PricingPage() {
  const { toast } = useToast();
  const [data, setData] = useState<PricingBundleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('fichas');

  const load = useCallback(async () => {
    try {
      setData(await api<PricingBundleDTO>('/api/pricing', 'GET'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando precificação…
      </div>
    );
  }

  const empty = data.sheets.length === 0 && data.ingredients.length === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-stone-900">
            <Calculator className="h-6 w-6 text-amber-600" /> Precificação & Custos
          </h1>
          <p className="text-sm text-stone-500">
            Insumos, fichas técnicas e preço de venda com custo fixo rateado pela receita real.
          </p>
        </div>
        <ImportButton onDone={load} />
      </header>

      <Summary data={data} />

      {empty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Nada cadastrado ainda. Use <strong>Importar planilha</strong> (arquivo <code>precificacao-planilha.json</code>) para trazer
          todos os insumos, fichas e custos da planilha PreçoFácil, ou cadastre manualmente nas abas abaixo.
        </div>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-stone-200 pb-2">
        {(
          [
            ['fichas', 'Fichas & Preços'],
            ['insumos', 'Insumos'],
            ['recursos', 'Equipamentos & Mão de obra'],
            ['custos', 'Custos fixos & Parâmetros'],
          ] as Array<[Tab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              tab === k ? 'bg-amber-600 text-white' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'fichas' && <SheetsTab data={data} reload={load} />}
      {tab === 'insumos' && <IngredientsTab data={data} reload={load} />}
      {tab === 'recursos' && <ResourcesTab data={data} reload={load} />}
      {tab === 'custos' && <CostsTab data={data} reload={load} />}
    </div>
  );
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

function Summary({ data }: { data: PricingBundleDTO }) {
  const produtos = data.sheets.filter((s) => s.kind === 'produto' && s.active);
  const avgMc = produtos.length ? produtos.reduce((s, p) => s + p.contributionMarginPct, 0) / produtos.length : 0;
  const below = produtos.filter((p) => p.contributionMarginPct < data.settings.targetMarginPct / 100).length;
  const cards = [
    { label: 'Produtos precificados', value: String(produtos.length), sub: `${data.ingredients.length} insumos` },
    { label: 'Custo fixo mensal', value: brl(data.fixedTotal, 0), sub: `${data.fixedRatePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da receita` },
    {
      label: 'Receita média usada',
      value: brl(data.revenue.used, 0),
      sub: data.revenue.source === 'manual' ? 'valor manual' : data.revenue.source === 'pedidos' ? `média dos últimos ${data.settings.revenueMonths} meses` : 'sem pedidos — custo fixo não rateado',
    },
    { label: 'Margem média (contribuição)', value: pct(avgMc), sub: `${below} abaixo da meta de ${data.settings.targetMarginPct}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{c.label}</div>
          <div className="mt-1 text-2xl font-black text-stone-900">{c.value}</div>
          <div className="text-xs text-stone-500">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Importação ──────────────────────────────────────────────────────────────

function ImportButton({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const json = JSON.parse(await file.text());
      const r = await api<{ ingredients: number; sheets: number; resources: number; fixedCosts: number; warnings: string[] }>(
        '/api/pricing/import',
        'POST',
        json,
      );
      toast(
        `Importado: ${r.ingredients} insumos, ${r.resources} recursos, ${r.sheets} fichas, ${r.fixedCosts} custos fixos.` +
          (r.warnings.length ? ` ${r.warnings.length} avisos.` : ''),
        r.warnings.length ? 'info' : 'success',
      );
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Arquivo inválido.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={`${btnGhost} cursor-pointer`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      Importar planilha
      <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

// ─── Fichas ──────────────────────────────────────────────────────────────────

function SheetsTab({ data, reload }: { data: PricingBundleDTO; reload: () => Promise<void> }) {
  const { toast, confirm } = useToast();
  const [kind, setKind] = useState<Kind>('produto');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<SheetDTO | 'new' | null>(null);

  const rows = useMemo(
    () => data.sheets.filter((s) => s.kind === kind && s.name.toLowerCase().includes(q.toLowerCase())),
    [data.sheets, kind, q],
  );
  const target = data.settings.targetMarginPct / 100;

  async function apply(s: SheetDTO) {
    if (!s.productId) return toast('Vincule a ficha a um produto (editar ficha) para aplicar o preço.', 'error');
    const ok = await confirm({
      title: 'Aplicar preço',
      message: `Gravar ${brl(s.suggestedPrice)} como preço de venda de "${s.productName}"? (hoje: ${brl(s.productPrice ?? 0)})`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    try {
      await api(`/api/pricing/sheets/${s.id}/apply-price`, 'POST', {});
      toast('Preço aplicado no produto.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar.', 'error');
    }
  }
  async function dup(s: SheetDTO) {
    try {
      await api(`/api/pricing/sheets/${s.id}/duplicate`, 'POST', {});
      toast('Ficha duplicada.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao duplicar.', 'error');
    }
  }
  async function remove(s: SheetDTO) {
    const ok = await confirm({ title: 'Excluir ficha', message: `Excluir "${s.name}"?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api(`/api/pricing/sheets/${s.id}`, 'DELETE');
      toast('Ficha excluída.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            {KIND_LABEL[k]} ({data.sheets.filter((s) => s.kind === k).length})
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar ficha…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className={btnPrimary} onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Nova ficha
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Ficha</th>
              <th className="px-3 py-2 text-right">Rend.</th>
              <th className="px-3 py-2 text-right">Custo/un</th>
              {kind === 'produto' ? (
                <>
                  <th className="px-3 py-2 text-right">Preço sugerido</th>
                  <th className="px-3 py-2 text-right">iFood</th>
                  <th className="px-3 py-2 text-right">Preço atual</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                </>
              ) : (
                <th className="px-3 py-2 text-right">Custo por {kind === 'massa' || kind === 'recheio' ? 'unid. de uso' : 'un'}</th>
              )}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((s) => {
              const margin = s.contributionMarginPct;
              const low = s.kind === 'produto' && margin < target;
              const priceGap = s.productPrice != null && s.suggestedPrice > 0 ? s.productPrice - s.suggestedPrice : null;
              return (
                <tr key={s.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2 font-semibold text-stone-900">
                    {s.name}
                    {s.warnings.length > 0 && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                    {s.productName && <div className="text-[11px] font-normal text-stone-400">↔ {s.productName}</div>}
                    {!s.active && <span className="ml-2 rounded bg-stone-200 px-1.5 text-[10px] text-stone-600">inativa</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-600">
                    {dec(s.yieldQty)} {s.yieldUnit}
                  </td>
                  <td className="px-3 py-2 text-right">{brl(s.kind === 'produto' ? s.costPerUnit : s.unitCost, s.kind === 'produto' ? 2 : 4)}</td>
                  {s.kind === 'produto' ? (
                    <>
                      <td className="px-3 py-2 text-right font-bold text-amber-700">{brl(s.suggestedPrice)}</td>
                      <td className="px-3 py-2 text-right text-stone-600">{brl(s.ifoodPrice)}</td>
                      <td className="px-3 py-2 text-right">
                        {s.productPrice != null ? (
                          <span className={priceGap != null && priceGap < -0.005 ? 'font-bold text-red-600' : 'text-stone-700'}>{brl(s.productPrice)}</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${low ? 'text-red-600' : 'text-emerald-600'}`}>{pct(margin)}</td>
                    </>
                  ) : (
                    <td className="px-3 py-2 text-right text-stone-600">
                      {brl(s.unitCost, 4)} / {s.yieldUnit === 'gramas' ? 'g' : 'un'}
                      {s.usedInCount > 0 && <div className="text-[11px] text-stone-400">usada em {s.usedInCount}</div>}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {s.kind === 'produto' && s.productId && (
                      <button title="Aplicar preço sugerido no produto" onClick={() => void apply(s)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button title="Editar" onClick={() => setEditing(s)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button title="Duplicar" onClick={() => void dup(s)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button title="Excluir" onClick={() => void remove(s)} className="rounded p-1.5 text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-stone-400">
                  Nenhuma ficha.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <SheetEditor
          data={data}
          sheet={editing === 'new' ? null : editing}
          defaultKind={kind}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </section>
  );
}

interface DraftLine {
  key: string;
  ref: string; // 'i:<id>' | 'r:<id>' | 's:<id>' | ''
  quantity: string;
}

function SheetEditor({
  data,
  sheet,
  defaultKind,
  onClose,
  onSaved,
}: {
  data: PricingBundleDTO;
  sheet: SheetDTO | null;
  defaultKind: Kind;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [f, setF] = useState({
    kind: (sheet?.kind ?? defaultKind) as Kind,
    name: sheet?.name ?? '',
    yieldQty: String(sheet?.yieldQty ?? 1),
    yieldUnit: sheet?.yieldUnit ?? 'unidades',
    lossPct: String(sheet?.lossPct ?? 0),
    markupPct: String(sheet?.markupPct ?? 100),
    totalWeightG: String(sheet?.totalWeightG ?? 0),
    notes: sheet?.notes ?? '',
    productId: sheet?.productId ?? '',
    active: sheet?.active ?? true,
  });
  const [lines, setLines] = useState<DraftLine[]>(
    (sheet?.lines ?? []).map((l, i) => ({
      key: `${i}-${l.id}`,
      ref: l.ingredientId ? `i:${l.ingredientId}` : l.resourceId ? `r:${l.resourceId}` : l.subSheetId ? `s:${l.subSheetId}` : '',
      quantity: String(l.quantity),
    })),
  );

  useEffect(() => {
    fetch('/api/products?pageSize=500')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const arr = (j?.data ?? j?.items ?? j) as Array<{ id: string; name: string }> | null;
        if (Array.isArray(arr)) setProducts(arr.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => undefined);
  }, []);

  const draftId = sheet?.id ?? '__new__';
  const live = useMemo(() => {
    const draft = {
      id: draftId,
      kind: f.kind,
      name: f.name,
      yieldQty: toNum(f.yieldQty),
      markupPct: toNum(f.markupPct),
      totalWeightG: toNum(f.totalWeightG),
      lossPct: toNum(f.lossPct),
      lines: lines
        .filter((l) => l.ref)
        .map((l) => ({
          ingredientId: l.ref.startsWith('i:') ? l.ref.slice(2) : null,
          resourceId: l.ref.startsWith('r:') ? l.ref.slice(2) : null,
          subSheetId: l.ref.startsWith('s:') ? l.ref.slice(2) : null,
          quantity: toNum(l.quantity),
        })),
    };
    const others = data.sheets
      .filter((s) => s.id !== draftId)
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        yieldQty: s.yieldQty,
        markupPct: s.markupPct,
        totalWeightG: s.totalWeightG,
        lossPct: s.lossPct,
        lines: s.lines.map((l) => ({ ingredientId: l.ingredientId, resourceId: l.resourceId, subSheetId: l.subSheetId, quantity: l.quantity })),
      }));
    const calc = computePricing({
      settings: data.settings,
      fixedRatePct: data.fixedRatePct,
      ingredients: data.ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, purchaseQty: i.purchaseQty, purchasePrice: i.purchasePrice, lossPct: i.lossPct })),
      resources: data.resources.map((r) => ({ id: r.id, name: r.name, kind: r.kind, watts: r.watts, gasKgPerHour: r.gasKgPerHour, monthlySalary: r.monthlySalary, chargesPct: r.chargesPct })),
      sheets: [...others, draft],
    });
    return calc.sheets[draftId];
  }, [f, lines, data, draftId]);

  const feePct = data.settings.cardFeePct + data.settings.taxPct;
  const markupTarget = markupForTargetMargin(data.settings.targetMarginPct, feePct);

  const options = useMemo(() => {
    const subs = data.sheets.filter((s) => s.kind !== 'produto' && s.id !== sheet?.id);
    return {
      ing: data.ingredients.filter((i) => i.active),
      res: data.resources.filter((r) => r.active),
      subs,
    };
  }, [data, sheet]);

  function lineInfo(l: DraftLine, idx: number) {
    const valid = lines.slice(0, idx + 1).filter((x) => x.ref).length - 1;
    const r = l.ref ? live?.lines[valid] : undefined;
    let unit = '';
    if (l.ref.startsWith('i:')) unit = data.ingredients.find((i) => i.id === l.ref.slice(2))?.unit ?? '';
    else if (l.ref.startsWith('r:')) unit = 'minutos';
    else if (l.ref.startsWith('s:')) unit = data.sheets.find((s) => s.id === l.ref.slice(2))?.yieldUnit ?? '';
    return { unit, total: r?.totalCost ?? 0, unitCost: r?.unitCost ?? 0 };
  }

  async function save() {
    if (!f.name.trim()) return toast('Informe o nome da ficha.', 'error');
    setSaving(true);
    try {
      const body = {
        kind: f.kind,
        name: f.name.trim(),
        yieldQty: toNum(f.yieldQty),
        yieldUnit: f.yieldUnit.trim() || 'unidades',
        lossPct: toNum(f.lossPct),
        markupPct: toNum(f.markupPct),
        totalWeightG: toNum(f.totalWeightG),
        notes: f.notes.trim() || null,
        productId: f.productId || null,
        active: f.active,
        lines: lines
          .filter((l) => l.ref)
          .map((l) => ({
            ingredientId: l.ref.startsWith('i:') ? l.ref.slice(2) : null,
            resourceId: l.ref.startsWith('r:') ? l.ref.slice(2) : null,
            subSheetId: l.ref.startsWith('s:') ? l.ref.slice(2) : null,
            quantity: toNum(l.quantity),
          })),
      };
      if (sheet) await api(`/api/pricing/sheets/${sheet.id}`, 'PUT', body);
      else await api('/api/pricing/sheets', 'POST', body);
      toast('Ficha salva.', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const isProduct = f.kind === 'produto';
  const mc = live?.contributionMarginPct ?? 0;

  return (
    <Modal title={sheet ? `Ficha: ${sheet.name}` : 'Nova ficha técnica'} onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tipo">
              <select className={inputCls} value={f.kind} disabled={!!sheet} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                <option value="produto">Produto final</option>
                <option value="massa">Massa (sub-ficha)</option>
                <option value="recheio">Recheio (sub-ficha)</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Nome">
                <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
            </div>
            <Field label="Rendimento">
              <input className={inputCls} inputMode="decimal" value={f.yieldQty} onChange={(e) => setF({ ...f, yieldQty: e.target.value })} />
            </Field>
            <Field label="Unidade">
              <input className={inputCls} value={f.yieldUnit} onChange={(e) => setF({ ...f, yieldUnit: e.target.value })} list="unit-list" />
              <datalist id="unit-list">
                <option value="unidades" />
                <option value="gramas" />
                <option value="ml" />
              </datalist>
            </Field>
            {isProduct ? (
              <Field label="Peso total (g)" hint="Para o preço por kg">
                <input className={inputCls} inputMode="decimal" value={f.totalWeightG} onChange={(e) => setF({ ...f, totalWeightG: e.target.value })} />
              </Field>
            ) : (
              <Field label="Perda (%)" hint="Ao usar como insumo">
                <input className={inputCls} inputMode="decimal" value={f.lossPct} onChange={(e) => setF({ ...f, lossPct: e.target.value })} />
              </Field>
            )}
          </div>

          <div className="rounded-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-2">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">Itens da ficha</span>
              <button className="text-xs font-bold text-amber-700" onClick={() => setLines([...lines, { key: String(Date.now()), ref: '', quantity: '' }])}>
                + Adicionar item
              </button>
            </div>
            <div className="divide-y divide-stone-100">
              {lines.map((l, idx) => {
                const info = lineInfo(l, idx);
                return (
                  <div key={l.key} className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                    <select
                      className={`${inputCls} col-span-12 sm:col-span-6`}
                      value={l.ref}
                      onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, ref: e.target.value } : x)))}
                    >
                      <option value="">Selecione…</option>
                      <optgroup label="Insumos">
                        {options.ing.map((i) => (
                          <option key={i.id} value={`i:${i.id}`}>
                            {i.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Equipamentos / Mão de obra (minutos)">
                        {options.res.map((r) => (
                          <option key={r.id} value={`r:${r.id}`}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Massas e recheios">
                        {options.subs.map((s) => (
                          <option key={s.id} value={`s:${s.id}`}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="col-span-5 flex items-center gap-1 sm:col-span-2">
                      <input
                        className={inputCls}
                        inputMode="decimal"
                        placeholder="Qtd"
                        value={l.quantity}
                        onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                      />
                    </div>
                    <span className="col-span-3 text-xs text-stone-400 sm:col-span-1">{info.unit}</span>
                    <span className="col-span-3 text-right text-sm font-semibold text-stone-800 sm:col-span-2">{brl(info.total, 4)}</span>
                    <button className="col-span-1 text-red-500" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remover item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {lines.length === 0 && <div className="px-3 py-6 text-center text-sm text-stone-400">Adicione insumos, equipamentos (minutos de uso) e mão de obra.</div>}
            </div>
          </div>

          <Field label="Observações / modo de preparo">
            <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
        </div>

        <aside className="space-y-3 rounded-xl bg-stone-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-stone-500">Resultado ao vivo</div>
          <Row k="Custo direto (lote)" v={brl(live?.directCost ?? 0)} />
          <Row k={`+ Custo fixo (${data.fixedRatePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)`} v={brl((live?.manufacturingCost ?? 0) - (live?.directCost ?? 0))} />
          <Row k="Custo de fabricação" v={brl(live?.manufacturingCost ?? 0)} />
          <Row k="Custo por unidade" v={brl(live?.costPerUnit ?? 0, 4)} strong />
          {isProduct && (
            <>
              <hr className="border-stone-200" />
              <Field label="Markup (%)" hint={`Para ${data.settings.targetMarginPct}% de margem: ${dec(markupTarget, 1)}%`}>
                <div className="flex gap-2">
                  <input className={inputCls} inputMode="decimal" value={f.markupPct} onChange={(e) => setF({ ...f, markupPct: e.target.value })} />
                  <button className={btnGhost} type="button" onClick={() => setF({ ...f, markupPct: markupTarget.toFixed(2) })} title="Usar a margem alvo">
                    Meta
                  </button>
                </div>
              </Field>
              <Row k="Preço sugerido" v={brl(live?.suggestedPrice ?? 0)} strong accent />
              <Row k="Preço iFood" v={brl(live?.ifoodPrice ?? 0)} />
              {toNum(f.totalWeightG) > 0 && <Row k="Preço por kg" v={brl(live?.pricePerKg ?? 0)} />}
              <Row k="Margem de contribuição" v={`${brl(live?.contributionMargin ?? 0)} (${pct(mc)})`} warn={mc < data.settings.targetMarginPct / 100} />
              <Field label="Produto vinculado" hint="Permite aplicar o preço no catálogo">
                <select className={inputCls} value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
                  <option value="">— sem vínculo —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {f.productId && !products.some((p) => p.id === f.productId) && <option value={f.productId}>{sheet?.productName ?? 'Produto atual'}</option>}
                </select>
              </Field>
            </>
          )}
          {!isProduct && <Row k="Custo por unidade de uso" v={brl(live?.unitCost ?? 0, 4)} strong accent />}
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ficha ativa
          </label>
          {live?.warnings.length ? <div className="text-xs text-red-600">{live.warnings.join(' · ')}</div> : null}
        </aside>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar ficha
        </button>
      </div>
    </Modal>
  );
}

function Row({ k, v, strong, accent, warn }: { k: string; v: string; strong?: boolean; accent?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-stone-500">{k}</span>
      <span className={`${strong ? 'text-base font-black' : 'font-semibold'} ${accent ? 'text-amber-700' : warn ? 'text-red-600' : 'text-stone-900'}`}>{v}</span>
    </div>
  );
}

// ─── Insumos ─────────────────────────────────────────────────────────────────

function IngredientsTab({ data, reload }: { data: PricingBundleDTO; reload: () => Promise<void> }) {
  const { toast, confirm } = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<IngredientDTO | 'new' | null>(null);
  const now = Date.now();

  const rows = data.ingredients.filter(
    (i) => i.name.toLowerCase().includes(q.toLowerCase()) && (!cat || i.category === cat),
  );

  async function remove(i: IngredientDTO) {
    const ok = await confirm({ title: 'Excluir insumo', message: `Excluir "${i.name}"?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api(`/api/pricing/ingredients/${i.id}`, 'DELETE');
      toast('Insumo excluído.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar insumo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} sm:w-56`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className={`${btnPrimary} ml-auto`} onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Novo insumo
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Insumo</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2 text-right">Compra</th>
              <th className="px-3 py-2 text-right">Perda</th>
              <th className="px-3 py-2 text-right">Custo / unid.</th>
              <th className="px-3 py-2">Preço de</th>
              <th className="px-3 py-2 text-right">Usos</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((i) => {
              const old = i.priceUpdatedAt ? (now - new Date(i.priceUpdatedAt).getTime()) / 86_400_000 > 90 : true;
              return (
                <tr key={i.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2 font-semibold text-stone-900">{i.name}</td>
                  <td className="px-3 py-2 text-stone-600">{CATEGORIES[i.category] ?? i.category}</td>
                  <td className="px-3 py-2 text-right text-stone-700">
                    {brl(i.purchasePrice)} / {dec(i.purchaseQty)} {i.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-600">{i.lossPct ? `${dec(i.lossPct, 1)}%` : '—'}</td>
                  <td className="px-3 py-2 text-right font-bold text-stone-900">{brl(i.unitCost, 4)}</td>
                  <td className={`px-3 py-2 text-xs ${old ? 'font-bold text-red-500' : 'text-stone-500'}`}>
                    {i.priceUpdatedAt ? new Date(`${i.priceUpdatedAt}T12:00:00`).toLocaleDateString('pt-BR') : 'sem data'}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-500">{i.usedIn}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button onClick={() => setEditing(i)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => void remove(i)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-stone-400">
                  Nenhum insumo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-400">Preços com mais de 90 dias aparecem em vermelho: vale conferir no fornecedor.</p>
      {editing && (
        <IngredientModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function IngredientModal({ item, onClose, onSaved }: { item: IngredientDTO | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: item?.name ?? '',
    category: item?.category ?? 'materia_prima',
    unit: item?.unit ?? 'gramas',
    purchaseQty: String(item?.purchaseQty ?? 1000),
    purchasePrice: String(item?.purchasePrice ?? ''),
    lossPct: String(item?.lossPct ?? 0),
    active: item?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const unitCost = toNum(f.purchaseQty) > 0 ? toNum(f.purchasePrice) / toNum(f.purchaseQty) / (1 - Math.min(toNum(f.lossPct), 99) / 100) : 0;

  async function save() {
    if (!f.name.trim()) return toast('Informe o nome.', 'error');
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        category: f.category,
        unit: f.unit.trim() || 'gramas',
        purchaseQty: toNum(f.purchaseQty),
        purchasePrice: toNum(f.purchasePrice),
        lossPct: toNum(f.lossPct),
        active: f.active,
      };
      if (item) await api(`/api/pricing/ingredients/${item.id}`, 'PUT', body);
      else await api('/api/pricing/ingredients', 'POST', body);
      toast('Insumo salvo.', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Editar insumo' : 'Novo insumo'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nome">
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Categoria">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unidade de uso">
          <input className={inputCls} value={f.unit} list="ing-units" onChange={(e) => setF({ ...f, unit: e.target.value })} />
          <datalist id="ing-units">
            <option value="gramas" />
            <option value="ml" />
            <option value="unidades" />
          </datalist>
        </Field>
        <Field label="Quantidade comprada" hint="Ex.: 1000 (g) para um pacote de 1 kg">
          <input className={inputCls} inputMode="decimal" value={f.purchaseQty} onChange={(e) => setF({ ...f, purchaseQty: e.target.value })} />
        </Field>
        <Field label="Preço pago (R$)">
          <input className={inputCls} inputMode="decimal" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: e.target.value })} />
        </Field>
        <Field label="Perda (%)" hint="Sobra/desperdício no uso">
          <input className={inputCls} inputMode="decimal" value={f.lossPct} onChange={(e) => setF({ ...f, lossPct: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <div className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Custo por {f.unit || 'unid.'}: <strong>{brl(unitCost, 4)}</strong>
          </div>
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Insumo ativo
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// ─── Equipamentos & Mão de obra ──────────────────────────────────────────────

function ResourcesTab({ data, reload }: { data: PricingBundleDTO; reload: () => Promise<void> }) {
  const { toast, confirm } = useToast();
  const [editing, setEditing] = useState<ResourceDTO | 'new' | null>(null);

  async function remove(r: ResourceDTO) {
    const ok = await confirm({ title: 'Excluir', message: `Excluir "${r.name}"?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api(`/api/pricing/resources/${r.id}`, 'DELETE');
      toast('Excluído.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">Custo por minuto de uso, calculado dos parâmetros (kWh, gás, jornada). Use nas fichas com a quantidade em minutos.</p>
        <button className={btnPrimary} onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.resources.map((r) => {
          const Icon = r.kind === 'eletrico' ? Zap : r.kind === 'gas' ? Flame : UserRound;
          const detail =
            r.kind === 'eletrico'
              ? `${dec(r.watts, 0)} W`
              : r.kind === 'gas'
                ? `${dec(r.gasKgPerHour)} kg/h`
                : `${brl(r.monthlySalary, 0)} + ${dec(r.chargesPct, 1)}% encargos`;
          return (
            <div key={r.id} className={`rounded-xl border bg-white p-4 ${r.active ? 'border-stone-200' : 'border-dashed opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-amber-600" />
                  <div>
                    <div className="font-bold text-stone-900">{r.name}</div>
                    <div className="text-xs text-stone-500">
                      {RES_LABEL[r.kind]} · {detail}
                    </div>
                  </div>
                </div>
                <div className="flex">
                  <button onClick={() => setEditing(r)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void remove(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-stone-500">Custo por minuto</span>
                <span className="text-lg font-black text-stone-900">{brl(r.unitCost, 4)}</span>
              </div>
              <div className="text-right text-[11px] text-stone-400">{brl(r.unitCost * 60)} / hora</div>
            </div>
          );
        })}
        {data.resources.length === 0 && <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-stone-400">Nenhum cadastro.</div>}
      </div>
      {editing && (
        <ResourceModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function ResourceModal({ item, onClose, onSaved }: { item: ResourceDTO | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [f, setF] = useState({
    name: item?.name ?? '',
    kind: item?.kind ?? ('eletrico' as ResourceDTO['kind']),
    watts: String(item?.watts ?? 0),
    gasKgPerHour: String(item?.gasKgPerHour ?? 0),
    monthlySalary: String(item?.monthlySalary ?? 0),
    chargesPct: String(item?.chargesPct ?? 0),
    active: item?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!f.name.trim()) return toast('Informe o nome.', 'error');
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        kind: f.kind,
        watts: toNum(f.watts),
        gasKgPerHour: toNum(f.gasKgPerHour),
        monthlySalary: toNum(f.monthlySalary),
        chargesPct: toNum(f.chargesPct),
        active: f.active,
      };
      if (item) await api(`/api/pricing/resources/${item.id}`, 'PUT', body);
      else await api('/api/pricing/resources', 'POST', body);
      toast('Salvo.', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Editar' : 'Novo equipamento / mão de obra'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nome">
            <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Tipo">
          <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ResourceDTO['kind'] })}>
            <option value="eletrico">Equipamento elétrico</option>
            <option value="gas">Equipamento a gás</option>
            <option value="mao_de_obra">Mão de obra</option>
          </select>
        </Field>
        {f.kind === 'eletrico' && (
          <Field label="Potência (W)">
            <input className={inputCls} inputMode="decimal" value={f.watts} onChange={(e) => setF({ ...f, watts: e.target.value })} />
          </Field>
        )}
        {f.kind === 'gas' && (
          <Field label="Consumo (kg/hora)">
            <input className={inputCls} inputMode="decimal" value={f.gasKgPerHour} onChange={(e) => setF({ ...f, gasKgPerHour: e.target.value })} />
          </Field>
        )}
        {f.kind === 'mao_de_obra' && (
          <>
            <Field label="Salário mensal (R$)">
              <input className={inputCls} inputMode="decimal" value={f.monthlySalary} onChange={(e) => setF({ ...f, monthlySalary: e.target.value })} />
            </Field>
            <Field label="Encargos (%)">
              <input className={inputCls} inputMode="decimal" value={f.chargesPct} onChange={(e) => setF({ ...f, chargesPct: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// ─── Custos fixos & parâmetros ───────────────────────────────────────────────

function CostsTab({ data, reload }: { data: PricingBundleDTO; reload: () => Promise<void> }) {
  const { toast, confirm } = useToast();
  const [s, setS] = useState({
    energyKwhPrice: String(data.settings.energyKwhPrice),
    gasCylinderPrice: String(data.settings.gasCylinderPrice),
    gasCylinderKg: String(data.settings.gasCylinderKg),
    workDaysPerMonth: String(data.settings.workDaysPerMonth),
    hoursPerDay: String(data.settings.hoursPerDay),
    ifoodFeePct: String(data.settings.ifoodFeePct),
    cardFeePct: String(data.settings.cardFeePct),
    taxPct: String(data.settings.taxPct),
    targetMarginPct: String(data.settings.targetMarginPct),
    revenueMonths: String(data.settings.revenueMonths),
    revenueOverride: data.settings.revenueOverride ? String(data.settings.revenueOverride) : '',
  });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FixedCostDTO | 'new' | null>(null);

  async function saveSettings() {
    setSaving(true);
    try {
      await api('/api/pricing/settings', 'PUT', {
        energyKwhPrice: toNum(s.energyKwhPrice),
        gasCylinderPrice: toNum(s.gasCylinderPrice),
        gasCylinderKg: toNum(s.gasCylinderKg),
        workDaysPerMonth: toNum(s.workDaysPerMonth),
        hoursPerDay: toNum(s.hoursPerDay),
        ifoodFeePct: toNum(s.ifoodFeePct),
        cardFeePct: toNum(s.cardFeePct),
        taxPct: toNum(s.taxPct),
        targetMarginPct: toNum(s.targetMarginPct),
        revenueMonths: toNum(s.revenueMonths),
        revenueOverride: s.revenueOverride.trim() ? toNum(s.revenueOverride) : null,
      });
      toast('Parâmetros salvos. Todos os preços foram recalculados.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeCost(c: FixedCostDTO) {
    const ok = await confirm({ title: 'Excluir custo fixo', message: `Excluir "${c.name}"?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api(`/api/pricing/fixed-costs/${c.id}`, 'DELETE');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-black text-stone-900">
            <Package className="h-4 w-4 text-amber-600" /> Custos fixos mensais
          </h2>
          <button className={btnGhost} onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
        <ul className="divide-y divide-stone-100">
          {data.fixedCosts.map((c) => (
            <li key={c.id} className={`flex items-center justify-between py-2 text-sm ${c.active ? '' : 'opacity-40'}`}>
              <span className="text-stone-800">{c.name}</span>
              <span className="flex items-center gap-1">
                <strong>{brl(c.monthlyAmount)}</strong>
                <button onClick={() => setEditing(c)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => void removeCost(c)} className="rounded p-1.5 text-red-500 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
          {data.fixedCosts.length === 0 && <li className="py-6 text-center text-sm text-stone-400">Nenhum custo fixo cadastrado.</li>}
        </ul>
        <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-sm font-black">
          <span>Total mensal</span>
          <span>{brl(data.fixedTotal)}</span>
        </div>

        <div className="rounded-lg bg-stone-50 p-3 text-sm">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-stone-500">Rateio automático pela receita real</div>
          <div className="space-y-1">
            {data.revenue.months.map((m) => (
              <div key={m.month} className="flex justify-between text-stone-600">
                <span>{m.month.split('-').reverse().join('/')}</span>
                <span>{brl(m.total, 0)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-bold">
            <span>Receita usada ({data.revenue.source === 'manual' ? 'manual' : 'média'})</span>
            <span>{brl(data.revenue.used, 0)}</span>
          </div>
          <div className="flex justify-between font-black text-amber-700">
            <span>Alíquota de custo fixo</span>
            <span>{data.fixedRatePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</span>
          </div>
          {data.revenue.source === 'nenhuma' && (
            <p className="mt-2 text-xs text-red-600">Sem pedidos nos meses fechados: o custo fixo não está sendo rateado. Informe uma receita manual ao lado, se quiser.</p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-black text-stone-900">
          <Settings2 className="h-4 w-4 text-amber-600" /> Parâmetros
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço do kWh (R$)"><input className={inputCls} inputMode="decimal" value={s.energyKwhPrice} onChange={set('energyKwhPrice')} /></Field>
          <Field label="Botijão de gás (R$)"><input className={inputCls} inputMode="decimal" value={s.gasCylinderPrice} onChange={set('gasCylinderPrice')} /></Field>
          <Field label="Kg do botijão"><input className={inputCls} inputMode="decimal" value={s.gasCylinderKg} onChange={set('gasCylinderKg')} /></Field>
          <Field label="Dias trabalhados/mês"><input className={inputCls} inputMode="numeric" value={s.workDaysPerMonth} onChange={set('workDaysPerMonth')} /></Field>
          <Field label="Horas por dia"><input className={inputCls} inputMode="decimal" value={s.hoursPerDay} onChange={set('hoursPerDay')} /></Field>
          <Field label="Margem alvo (%)"><input className={inputCls} inputMode="decimal" value={s.targetMarginPct} onChange={set('targetMarginPct')} /></Field>
          <Field label="Taxa de cartão (%)"><input className={inputCls} inputMode="decimal" value={s.cardFeePct} onChange={set('cardFeePct')} /></Field>
          <Field label="Imposto (%)"><input className={inputCls} inputMode="decimal" value={s.taxPct} onChange={set('taxPct')} /></Field>
          <Field label="Taxa iFood (%)"><input className={inputCls} inputMode="decimal" value={s.ifoodFeePct} onChange={set('ifoodFeePct')} /></Field>
          <Field label="Meses na média da receita"><input className={inputCls} inputMode="numeric" value={s.revenueMonths} onChange={set('revenueMonths')} /></Field>
          <div className="col-span-2">
            <Field label="Receita mensal manual (opcional)" hint="Deixe vazio para usar a média dos pedidos reais.">
              <input className={inputCls} inputMode="decimal" value={s.revenueOverride} onChange={set('revenueOverride')} placeholder="Automático" />
            </Field>
          </div>
        </div>
        <button className={btnPrimary} disabled={saving} onClick={() => void saveSettings()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar parâmetros
        </button>
      </div>

      {editing && (
        <FixedCostModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function FixedCostModal({ item, onClose, onSaved }: { item: FixedCostDTO | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(String(item?.monthlyAmount ?? ''));
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast('Informe o nome.', 'error');
    setSaving(true);
    try {
      const body = { name: name.trim(), monthlyAmount: toNum(amount), active };
      if (item) await api(`/api/pricing/fixed-costs/${item.id}`, 'PUT', body);
      else await api('/api/pricing/fixed-costs', 'POST', body);
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={item ? 'Editar custo fixo' : 'Novo custo fixo'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Valor mensal (R$)"><input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Entra no rateio
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={btnGhost} onClick={onClose}>Cancelar</button>
        <button className={btnPrimary} disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}
