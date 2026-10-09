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
  Download,
  Link2,
  LayoutDashboard,
  TrendingDown,
} from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import { channelMargin, computePricing, priceForTargetMargin, suggestedPrice } from '@/server/domain/precificacao';
import type {
  CatalogProductDTO,
  FixedCostDTO,
  IngredientDTO,
  PricingBundleDTO,
  ResourceDTO,
  SheetDTO,
} from '@/server/services/precificacao';

type Tab = 'painel' | 'fichas' | 'insumos' | 'recursos' | 'custos';
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
  const [tab, setTab] = useState<Tab>('painel');
  const [drawer, setDrawer] = useState<OpenTarget>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  const handledQuery = React.useRef(false);

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

  const createFromProduct = useCallback(
    async (productId: string) => {
      try {
        const r = await api<{ id: string; created: boolean; unmatched: string[] }>('/api/pricing/sheets/from-product', 'POST', { productId });
        if (r.created && r.unmatched?.length) {
          toast(`Ficha criada. Sem correspondência nos insumos: ${r.unmatched.slice(0, 4).join(', ')}${r.unmatched.length > 4 ? '…' : ''}`, 'info');
        }
        setPendingOpen(r.id);
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Erro ao criar ficha.', 'error');
      }
    },
    [load, toast],
  );

  useEffect(() => {
    if (!pendingOpen || !data) return;
    const found = data.sheets.find((x) => x.id === pendingOpen);
    if (found) {
      setTab('fichas');
      setDrawer(found);
      setPendingOpen(null);
    }
  }, [pendingOpen, data]);

  useEffect(() => {
    if (!data || handledQuery.current) return;
    handledQuery.current = true;
    const productId = new URLSearchParams(window.location.search).get('product');
    if (!productId) return;
    setTab('fichas');
    const existing = data.sheets.find((x) => x.productId === productId);
    if (existing) setDrawer(existing);
    else void createFromProduct(productId);
  }, [data, createFromProduct]);

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
        <div className="flex flex-wrap gap-2">
          <SyncCostsButton onDone={load} />
          <LinkProductsButton onDone={load} />
          <button className={btnGhost} onClick={() => exportCsv(data)}>
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <ImportButton onDone={load} />
        </div>
      </header>

      {empty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Nada cadastrado ainda. Use <strong>Importar planilha</strong> (arquivo <code>precificacao-planilha.json</code>) para trazer
          todos os insumos, fichas e custos da planilha PreçoFácil, ou cadastre manualmente nas abas abaixo.
        </div>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-stone-200 pb-2">
        {(
          [
            ['painel', 'Painel'],
            ['fichas', 'Produtos & Fichas'],
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

      {tab === 'painel' && <DashboardTab data={data} reload={load} onOpen={setDrawer} />}
      {tab === 'fichas' && <SheetsTab data={data} reload={load} onOpen={setDrawer} onCreateFromProduct={createFromProduct} />}
      {tab === 'insumos' && <IngredientsTab data={data} reload={load} />}
      {tab === 'recursos' && <ResourcesTab data={data} reload={load} />}
      {tab === 'custos' && <CostsTab data={data} reload={load} />}

      {drawer && (
        <SheetDrawer
          key={isSheet(drawer) ? drawer.id : 'new'}
          data={data}
          target={drawer}
          onClose={() => setDrawer(null)}
          onSaved={async () => {
            setDrawer(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

function Summary({ data }: { data: PricingBundleDTO }) {
  const sm = data.summary;
  const cards = [
    { label: 'Produtos', value: String(sm.products), sub: `${data.ingredients.length} insumos cadastrados` },
    {
      label: 'Margem média (balcão)',
      value: `${sm.avgMarginPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
      sub: `meta ${data.settings.targetMarginPct}% · ${sm.belowTarget} abaixo${sm.loss ? ` · ${sm.loss} no prejuízo` : ''}`,
      warn: sm.loss > 0,
    },
    {
      label: 'Custo fixo mensal',
      value: brl(data.fixedTotal, 0),
      sub: `${data.fixedRatePct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da receita de ${brl(data.revenue.used, 0)}`,
    },
    {
      label: 'Ponto de equilíbrio',
      value: sm.breakEvenRevenue > 0 ? brl(sm.breakEvenRevenue, 0) : '—',
      sub: sm.breakEvenRevenue > 0 && data.revenue.used > 0 ? `${Math.round((data.revenue.used / sm.breakEvenRevenue) * 100)}% do equilíbrio atingido` : 'faturamento mensal mínimo',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border bg-white p-4 ${c.warn ? 'border-red-300' : 'border-stone-200'}`}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">{c.label}</div>
          <div className="mt-1 text-2xl font-black text-stone-900">{c.value}</div>
          <div className="text-xs text-stone-500">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function exportCsv(data: PricingBundleDTO) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (v: number) => v.toFixed(2).replace('.', ',');
  const rows = [
    ['Produto', 'Custo/un', 'Preço em uso', 'Origem do preço', 'Margem balcão %', 'Margem iFood %', 'Margem revenda %', 'Preço p/ meta'],
    ...data.sheets
      .filter((s) => s.kind === 'produto')
      .map((s) => [
        s.name,
        num(s.costPerUnit),
        num(s.effectivePrice),
        s.priceSource,
        num(s.channels.balcao.mcPct * 100),
        num(s.channels.ifood.mcPct * 100),
        num(s.channels.revenda.mcPct * 100),
        num(s.targetPrice),
      ]),
  ];
  const csv = '\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'precificacao-produtos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function LinkProductsButton({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ linked: unknown[]; unmatched: string[] }>('/api/pricing/link-products', 'POST', {});
      toast(
        `${r.linked.length} ficha(s) ligada(s) ao cadastro.` + (r.unmatched.length ? ` Sem correspondência: ${r.unmatched.slice(0, 4).join(', ')}${r.unmatched.length > 4 ? '…' : ''}.` : ''),
        r.unmatched.length ? 'info' : 'success',
      );
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao vincular.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={btnGhost} disabled={busy} onClick={() => void run()} title="Liga cada ficha ao produto cadastrado de mesmo nome">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Vincular produtos
    </button>
  );
}

function SyncCostsButton({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ updated?: number }>('/api/pricing/sync-costs', 'POST', {});
      toast(`Custos atualizados nos produtos${typeof r.updated === 'number' ? ` (${r.updated})` : ''}.`, 'success');
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar custos.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className={btnGhost} disabled={busy} onClick={() => void run()} title="Grava o custo por unidade das fichas no cadastro dos produtos">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />} Atualizar custos nos produtos
    </button>
  );
}

// ─── Painel ──────────────────────────────────────────────────────────────────

function MarginBar({ value, target }: { value: number; target: number }) {
  const scale = 0.7;
  const w = Math.max(0, Math.min(1, value / scale)) * 100;
  const tpos = Math.min(1, target / scale) * 100;
  const color = value < 0 ? 'bg-red-600' : value < target ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="relative h-3 w-full rounded-full bg-stone-100">
      <div className={`h-3 rounded-full ${color}`} style={{ width: `${w}%` }} />
      <div className="absolute top-[-2px] h-4 w-0.5 bg-stone-700" style={{ left: `${tpos}%` }} title={`Meta ${pct(target)}`} />
    </div>
  );
}

function DashboardTab({ data, reload, onOpen }: { data: PricingBundleDTO; reload: () => Promise<void>; onOpen: (t: OpenTarget) => void }) {
  const { toast, confirm } = useToast();
  const target = data.settings.targetMarginPct / 100;
  const products = data.sheets.filter((s) => s.kind === 'produto' && s.active && s.status !== 'sem_custo');
  const toFix = products.filter((s) => s.status === 'baixa' || s.status === 'prejuizo').sort((a, b) => a.channels.balcao.mcPct - b.channels.balcao.mcPct);
  const bars = [...products].sort((a, b) => a.channels.balcao.mcPct - b.channels.balcao.mcPct);
  const semCusto = data.sheets.filter((s) => s.kind === 'produto' && s.active && s.status === 'sem_custo');

  async function apply(s: SheetDTO) {
    if (!s.productId) return toast('Vincule a ficha a um produto (botão "Vincular produtos" ou editar ficha).', 'error');
    const ok = await confirm({
      title: 'Aplicar preço',
      message: `Gravar ${brl(s.targetPrice)} como preço de "${s.productName}"? (hoje: ${brl(s.effectivePrice)})`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    try {
      await api(`/api/pricing/sheets/${s.id}/apply-price`, 'POST', { price: s.targetPrice });
      toast('Preço aplicado no produto.', 'success');
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar.', 'error');
    }
  }

  return (
    <section className="space-y-5">
      <Summary data={data} />

      {(data.summary.staleIngredients > 0 || semCusto.length > 0 || data.revenue.source === 'nenhuma') && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" /> Pontos de atenção
          </div>
          {data.summary.staleIngredients > 0 && (
            <div>{data.summary.staleIngredients} insumo(s) em uso com preço de mais de 60 dias — confira na aba Insumos.</div>
          )}
          {semCusto.length > 0 && <div>{semCusto.length} produto(s) sem custo calculado (ficha vazia): {semCusto.slice(0, 5).map((s) => s.name).join(', ')}.</div>}
          {data.revenue.source === 'nenhuma' && <div>Sem pedidos nos últimos meses: o custo fixo não está sendo rateado. Informe a receita manual em Custos & Parâmetros.</div>}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-black uppercase tracking-wide text-stone-700">Preços para ajustar ({toFix.length})</h2>
        </div>
        {toFix.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-emerald-700">Todos os produtos estão na margem alvo de {data.settings.targetMarginPct}%.</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {toFix.map((s) => (
              <div key={s.id} className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50" onClick={() => onOpen(s)}>
                <div className="min-w-[10rem] flex-1">
                  <div className="font-semibold text-stone-900">{s.name}</div>
                  <div className="text-xs text-stone-500">
                    custo {brl(s.costPerUnit)} · margem <span className={s.status === 'prejuizo' ? 'font-bold text-red-600' : 'font-bold text-amber-600'}>{pct(s.channels.balcao.mcPct)}</span>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-stone-400 line-through">{brl(s.effectivePrice)}</div>
                  <div className="font-black text-emerald-700">{brl(s.targetPrice)}</div>
                </div>
                <button className={btnGhost} onClick={(e) => { e.stopPropagation(); void apply(s); }} disabled={!s.productId} title={s.productId ? 'Gravar no cadastro do produto' : 'Sem produto vinculado'}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aplicar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
          <LayoutDashboard className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-black uppercase tracking-wide text-stone-700">Margem por produto e canal</h2>
          <span className="ml-auto text-[11px] text-stone-400">traço = meta {data.settings.targetMarginPct}%</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Produto</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="w-48 px-3 py-2">Balcão</th>
                <th className="px-3 py-2 text-right">iFood</th>
                <th className="px-3 py-2 text-right">Revenda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bars.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-stone-50" onClick={() => onOpen(s)}>
                  <td className="px-4 py-2 font-semibold text-stone-900">{s.name}</td>
                  <td className="px-3 py-2 text-right text-stone-700">
                    {brl(s.effectivePrice)}
                    <div className="text-[10px] text-stone-400">{s.priceSource}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <MarginBar value={s.channels.balcao.mcPct} target={target} />
                      </div>
                      <span className={`w-12 text-right text-xs font-bold ${s.channels.balcao.mcPct < target ? 'text-red-600' : 'text-emerald-600'}`}>{pct(s.channels.balcao.mcPct)}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${s.channels.ifood.mcPct < 0 ? 'text-red-600' : s.channels.ifood.mcPct < target ? 'text-amber-600' : 'text-stone-700'}`}>{pct(s.channels.ifood.mcPct)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${s.channels.revenda.mcPct < 0 ? 'text-red-600' : s.channels.revenda.mcPct < target ? 'text-amber-600' : 'text-stone-700'}`}>{pct(s.channels.revenda.mcPct)}</td>
                </tr>
              ))}
              {bars.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone-400">
                    Nenhum produto precificado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">
          Margem de contribuição = preço − custo de fabricação (com custo fixo rateado) − taxas do canal. Balcão: cartão + imposto; iFood: taxa iFood; revenda: imposto + comissão.
        </p>
      </div>
    </section>
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

type OpenTarget = SheetDTO | { newKind: Kind } | null;

function isSheet(t: OpenTarget): t is SheetDTO {
  return !!t && 'id' in t;
}

type ProductRow =
  | { type: 'sheet'; key: string; name: string; sheet: SheetDTO }
  | { type: 'catalog'; key: string; name: string; product: CatalogProductDTO };

function SheetsTab({
  data,
  reload,
  onOpen,
  onCreateFromProduct,
}: {
  data: PricingBundleDTO;
  reload: () => Promise<void>;
  onOpen: (t: OpenTarget) => void;
  onCreateFromProduct: (productId: string) => Promise<void>;
}) {
  const { toast, confirm } = useToast();
  const [kind, setKind] = useState<Kind>('produto');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'todos' | 'sem_ficha' | 'ajustar'>('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const target = data.settings.targetMarginPct / 100;

  const catalogNoSheet = useMemo(() => data.catalog.filter((p) => !p.sheetId), [data.catalog]);

  const productRows = useMemo<ProductRow[]>(() => {
    const needle = q.toLowerCase();
    const all: ProductRow[] = [
      ...data.sheets
        .filter((s) => s.kind === 'produto')
        .map((s) => ({ type: 'sheet' as const, key: s.id, name: s.name, sheet: s })),
      ...catalogNoSheet.map((p) => ({ type: 'catalog' as const, key: `p-${p.id}`, name: p.name, product: p })),
    ];
    return all
      .filter((r) => r.name.toLowerCase().includes(needle))
      .filter((r) => {
        if (filter === 'sem_ficha') return r.type === 'catalog';
        if (filter === 'ajustar') return r.type === 'sheet' && (r.sheet.status === 'baixa' || r.sheet.status === 'prejuizo');
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data.sheets, catalogNoSheet, q, filter]);

  const subRows = useMemo(
    () => data.sheets.filter((s) => s.kind === kind && s.name.toLowerCase().includes(q.toLowerCase())),
    [data.sheets, kind, q],
  );

  async function apply(s: SheetDTO) {
    if (!s.productId) return toast('Vincule a ficha a um produto (abra a ficha) para aplicar o preço.', 'error');
    const ok = await confirm({
      title: 'Aplicar preço',
      message: `Gravar ${brl(s.targetPrice)} (margem alvo) como preço de venda de "${s.productName}"? (hoje: ${brl(s.productPrice ?? 0)})`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) return;
    try {
      await api(`/api/pricing/sheets/${s.id}/apply-price`, 'POST', { price: s.targetPrice });
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
  async function createAll() {
    const ok = await confirm({
      title: 'Criar fichas dos produtos',
      message: `Criar ficha técnica para os ${catalogNoSheet.length} produtos sem ficha, usando a receita cadastrada em Produtos Acabados?`,
      confirmLabel: 'Criar fichas',
    });
    if (!ok) return;
    setBusy('all');
    try {
      const r = await api<{ created: number; withRecipe: number; unmatched: string[] }>('/api/pricing/sheets/from-product', 'POST', { all: true });
      toast(
        `${r.created} ficha(s) criada(s), ${r.withRecipe} com receita.${r.unmatched.length ? ` Insumos sem correspondência: ${r.unmatched.slice(0, 5).join(', ')}${r.unmatched.length > 5 ? '…' : ''}` : ''}`,
        r.unmatched.length ? 'info' : 'success',
      );
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar fichas.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            {KIND_LABEL[k]} ({k === 'produto' ? data.sheets.filter((s) => s.kind === 'produto').length + catalogNoSheet.length : data.sheets.filter((s) => s.kind === k).length})
          </button>
        ))}
        {kind === 'produto' && (
          <select className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold text-stone-700" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="todos">Todos</option>
            <option value="sem_ficha">Sem ficha ({catalogNoSheet.length})</option>
            <option value="ajustar">Preço a ajustar</option>
          </select>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {kind === 'produto' && catalogNoSheet.length > 0 && (
          <button className={btnGhost} disabled={busy === 'all'} onClick={() => void createAll()}>
            {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Criar fichas dos {catalogNoSheet.length} sem ficha
          </button>
        )}
        <button className={btnPrimary} onClick={() => onOpen({ newKind: kind })}>
          <Plus className="h-4 w-4" /> Nova ficha
        </button>
      </div>

      {kind === 'produto' ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2 text-right">Rend.</th>
                <th className="px-3 py-2 text-right">Custo/un</th>
                <th className="px-3 py-2 text-right">Preço em uso</th>
                <th className="px-3 py-2 text-right">Balcão</th>
                <th className="px-3 py-2 text-right">iFood</th>
                <th className="px-3 py-2 text-right">Revenda</th>
                <th className="px-3 py-2 text-right">Preço p/ meta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {productRows.map((r) => {
                if (r.type === 'catalog') {
                  const p = r.product;
                  return (
                    <tr key={r.key} className="cursor-pointer bg-amber-50/40 hover:bg-amber-50" onClick={() => void onCreateFromProduct(p.id)}>
                      <td className="px-3 py-2 font-semibold text-stone-900">
                        {p.name}
                        <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">sem ficha</span>
                        <div className="text-[11px] font-normal text-stone-400">
                          {p.recipeLines > 0 ? `${p.recipeLines} item(ns) de receita cadastrados` : 'sem receita cadastrada'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-stone-400">—</td>
                      <td className="px-3 py-2 text-right text-stone-600">{p.cost > 0 ? brl(p.cost) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-stone-800">
                        {brl(p.salePrice)}
                        <div className="text-[10px] font-normal text-stone-400">produto</div>
                      </td>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs text-stone-400">
                        Clique para criar a ficha a partir da receita
                      </td>
                      <td className="px-3 py-2 text-right" onClick={stop}>
                        <button className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50" onClick={() => void onCreateFromProduct(p.id)}>
                          Criar ficha
                        </button>
                      </td>
                    </tr>
                  );
                }
                const s = r.sheet;
                const low = s.status === 'baixa';
                return (
                  <tr key={r.key} className="cursor-pointer hover:bg-stone-50" onClick={() => onOpen(s)}>
                    <td className="px-3 py-2 font-semibold text-stone-900">
                      {s.name}
                      {s.warnings.length > 0 && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                      {s.productName && <div className="text-[11px] font-normal text-stone-400">↔ {s.productName}</div>}
                      {!s.active && <span className="ml-2 rounded bg-stone-200 px-1.5 text-[10px] text-stone-600">inativa</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-stone-600">
                      {dec(s.yieldQty)} {s.yieldUnit}
                    </td>
                    <td className="px-3 py-2 text-right">{brl(s.costPerUnit)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-stone-800">
                      {brl(s.effectivePrice)}
                      <div className="text-[10px] font-normal text-stone-400">{s.priceSource}</div>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${s.status === 'prejuizo' ? 'text-red-600' : low ? 'text-amber-600' : 'text-emerald-600'}`}>{pct(s.channels.balcao.mcPct)}</td>
                    <td className={`px-3 py-2 text-right text-xs font-bold ${s.channels.ifood.mcPct < target ? 'text-amber-600' : 'text-stone-700'}`}>{pct(s.channels.ifood.mcPct)}</td>
                    <td className={`px-3 py-2 text-right text-xs font-bold ${s.channels.revenda.mcPct < target ? 'text-amber-600' : 'text-stone-700'}`}>{pct(s.channels.revenda.mcPct)}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">{brl(s.targetPrice)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right" onClick={stop}>
                      {s.productId && (
                        <button title="Aplicar preço da margem alvo no produto" onClick={() => void apply(s)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
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
              {productRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-stone-400">
                    Nenhum produto.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Ficha</th>
                <th className="px-3 py-2 text-right">Rend.</th>
                <th className="px-3 py-2 text-right">Custo do lote</th>
                <th className="px-3 py-2 text-right">Custo por unid. de uso</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {subRows.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-stone-50" onClick={() => onOpen(s)}>
                  <td className="px-3 py-2 font-semibold text-stone-900">
                    {s.name}
                    {s.warnings.length > 0 && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                    {!s.active && <span className="ml-2 rounded bg-stone-200 px-1.5 text-[10px] text-stone-600">inativa</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-600">
                    {dec(s.yieldQty)} {s.yieldUnit}
                  </td>
                  <td className="px-3 py-2 text-right">{brl(s.manufacturingCost)}</td>
                  <td className="px-3 py-2 text-right text-stone-600">
                    {brl(s.unitCost, 4)} / {s.yieldUnit === 'gramas' ? 'g' : 'un'}
                    {s.usedInCount > 0 && <div className="text-[11px] text-stone-400">usada em {s.usedInCount}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right" onClick={stop}>
                    <button title="Duplicar" onClick={() => void dup(s)} className="rounded p-1.5 text-stone-600 hover:bg-stone-100">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button title="Excluir" onClick={() => void remove(s)} className="rounded p-1.5 text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {subRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-stone-400">
                    Nenhuma ficha.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DraftLine {
  key: string;
  ref: string; // 'i:<id>' | 'r:<id>' | 's:<id>' | ''
  quantity: string;
}

const SEG_COLORS = ['bg-amber-500', 'bg-rose-400', 'bg-sky-500', 'bg-emerald-500', 'bg-violet-500', 'bg-stone-500', 'bg-orange-300'];

function SheetDrawer({
  data,
  target,
  onClose,
  onSaved,
}: {
  data: PricingBundleDTO;
  target: Exclude<OpenTarget, null>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast, confirm } = useToast();
  const sheet = isSheet(target) ? target : null;
  const defaultKind: Kind = isSheet(target) ? target.kind : target.newKind;
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [f, setF] = useState({
    kind: (sheet?.kind ?? defaultKind) as Kind,
    name: sheet?.name ?? '',
    yieldQty: String(sheet?.yieldQty ?? 1),
    yieldUnit: sheet?.yieldUnit ?? 'unidades',
    lossPct: String(sheet?.lossPct ?? 0),
    markupPct: String(sheet?.markupPct ?? 100),
    totalWeightG: String(sheet?.totalWeightG ?? 0),
    actualPrice: sheet?.actualPrice ? String(sheet.actualPrice) : '',
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const draftId = sheet?.id ?? '__new__';
  const isProduct = f.kind === 'produto';
  const s = data.settings;
  const balcaoFee = s.cardFeePct + s.taxPct;
  const ifoodFee = s.ifoodFeePct;
  const resellerFee = s.taxPct + s.resellerCommissionPct;
  const targetPct = s.targetMarginPct;

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
      .filter((x) => x.id !== draftId)
      .map((x) => ({
        id: x.id,
        kind: x.kind,
        name: x.name,
        yieldQty: x.yieldQty,
        markupPct: x.markupPct,
        totalWeightG: x.totalWeightG,
        lossPct: x.lossPct,
        lines: x.lines.map((l) => ({ ingredientId: l.ingredientId, resourceId: l.resourceId, subSheetId: l.subSheetId, quantity: l.quantity })),
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

  const options = useMemo(
    () => ({
      ing: data.ingredients.filter((i) => i.active),
      res: data.resources.filter((r) => r.active),
      subs: data.sheets.filter((x) => x.id !== sheet?.id),
    }),
    [data, sheet],
  );

  const catalogOptions = useMemo(
    () => data.catalog.filter((p) => !p.sheetId || p.sheetId === sheet?.id || p.id === f.productId),
    [data.catalog, sheet, f.productId],
  );

  function lineInfo(l: DraftLine, idx: number) {
    const valid = lines.slice(0, idx + 1).filter((x) => x.ref).length - 1;
    const r = l.ref ? live?.lines[valid] : undefined;
    let unit = '';
    if (l.ref.startsWith('i:')) unit = data.ingredients.find((i) => i.id === l.ref.slice(2))?.unit ?? '';
    else if (l.ref.startsWith('r:')) unit = 'min';
    else if (l.ref.startsWith('s:')) unit = data.sheets.find((x) => x.id === l.ref.slice(2))?.yieldUnit ?? '';
    return { unit, total: r?.totalCost ?? 0, unitCost: r?.unitCost ?? 0 };
  }

  // custo por categoria (barra empilhada)
  const segments = useMemo(() => {
    const acc = new Map<string, number>();
    const add = (label: string, v: number) => acc.set(label, (acc.get(label) ?? 0) + v);
    let idx = -1;
    for (const l of lines) {
      if (!l.ref) continue;
      idx += 1;
      const total = live?.lines[idx]?.totalCost ?? 0;
      if (l.ref.startsWith('i:')) {
        const ing = data.ingredients.find((i) => i.id === l.ref.slice(2));
        add(CATEGORIES[ing?.category ?? 'outros'] ?? 'Outros', total);
      } else if (l.ref.startsWith('r:')) {
        const res = data.resources.find((r) => r.id === l.ref.slice(2));
        add(res?.kind === 'mao_de_obra' ? 'Mão de obra' : 'Equipamentos (energia/gás)', total);
      } else add('Bases e recheios', total);
    }
    const fixed = (live?.manufacturingCost ?? 0) - (live?.directCost ?? 0);
    if (fixed > 0) add('Custo fixo rateado', fixed);
    return [...acc.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [lines, live, data.ingredients, data.resources]);
  const segTotal = segments.reduce((a, [, v]) => a + v, 0);

  const cost = live?.costPerUnit ?? 0;
  const price = toNum(f.actualPrice);
  const priceForCalc = price > 0 ? price : live?.suggestedPrice ?? 0;
  const balcao = channelMargin(priceForCalc, cost, balcaoFee);
  const ifood = channelMargin(priceForCalc, cost, ifoodFee);
  const revenda = channelMargin(priceForCalc, cost, resellerFee);
  const targetPrice = priceForTargetMargin(cost, targetPct, balcaoFee);
  const markupFromPrice = cost > 0 && price > 0 ? ((price - cost) / cost) * 100 : null;

  function setPrice(v: string) {
    const n = toNum(v);
    const next = { ...f, actualPrice: v };
    if (n > 0 && cost > 0) next.markupPct = (((n - cost) / cost) * 100).toFixed(2);
    setF(next);
  }
  function setMarkup(v: string) {
    const next = { ...f, markupPct: v };
    setF(next);
  }
  function pickProduct(id: string) {
    const p = data.catalog.find((x) => x.id === id);
    setF((cur) => ({
      ...cur,
      productId: id,
      name: cur.name.trim() ? cur.name : p?.name ?? cur.name,
      actualPrice: cur.actualPrice.trim() ? cur.actualPrice : p && p.salePrice > 0 ? String(p.salePrice) : cur.actualPrice,
    }));
  }

  async function save(applyAfter: boolean) {
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
        actualPrice: f.actualPrice.trim() ? toNum(f.actualPrice) : null,
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
      const saved = sheet
        ? await api<{ id?: string }>(`/api/pricing/sheets/${sheet.id}`, 'PUT', body)
        : await api<{ id?: string }>('/api/pricing/sheets', 'POST', body);
      const id = sheet?.id ?? saved?.id;
      if (applyAfter) {
        if (!f.productId || !id) toast('Ficha salva, mas falta vincular um produto para aplicar o preço.', 'info');
        else if (price <= 0) toast('Ficha salva, mas informe o preço que pratico para aplicar.', 'info');
        else {
          await api(`/api/pricing/sheets/${id}/apply-price`, 'POST', { price });
          toast('Ficha salva e preço aplicado no produto.', 'success');
        }
      } else toast('Ficha salva.', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!sheet) return;
    const ok = await confirm({ title: 'Excluir ficha', message: `Excluir "${sheet.name}"?`, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api(`/api/pricing/sheets/${sheet.id}`, 'DELETE');
      toast('Ficha excluída.', 'success');
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao excluir.', 'error');
    }
  }

  const mcCls = (v: number) => (v < 0 ? 'text-red-600' : v * 100 < targetPct ? 'text-amber-600' : 'text-emerald-600');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={sheet ? `Ficha ${sheet.name}` : 'Nova ficha'}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-stone-900">{sheet ? sheet.name : 'Nova ficha técnica'}</h3>
            <p className="text-xs text-stone-500">
              {isProduct ? 'Produto final' : f.kind === 'massa' ? 'Massa (sub-ficha)' : 'Recheio (sub-ficha)'} · custos atualizam ao vivo
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nome">
                <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!sheet} />
              </Field>
            </div>
            <Field label="Rendimento" hint={f.yieldUnit}>
              <input className={inputCls} inputMode="decimal" value={f.yieldQty} onChange={(e) => setF({ ...f, yieldQty: e.target.value })} />
            </Field>
            {isProduct ? (
              <Field label="Markup sobre o custo (%)" hint={`Para ${targetPct}% de margem: ${dec(data.settings.targetMarginPct > 0 ? ((targetPrice - cost) / (cost || 1)) * 100 : 0, 1)}%`}>
                <input className={inputCls} inputMode="decimal" value={f.markupPct} onChange={(e) => setMarkup(e.target.value)} />
              </Field>
            ) : (
              <Field label="Perda (%)" hint="Ao usar como insumo">
                <input className={inputCls} inputMode="decimal" value={f.lossPct} onChange={(e) => setF({ ...f, lossPct: e.target.value })} />
              </Field>
            )}
            {isProduct && (
              <>
                <div className="col-span-2">
                  <Field
                    label="Preço que pratico (R$)"
                    hint={markupFromPrice !== null ? `Markup real sobre o custo: ${dec(markupFromPrice, 1)}%` : 'Quanto você cobra no balcão. Vazio = preço do produto vinculado.'}
                  >
                    <input className={inputCls} inputMode="decimal" value={f.actualPrice} onChange={(e) => setPrice(e.target.value)} />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Produto vinculado (Produtos Acabados)" hint="Custo e preço conversam com o cadastro do produto">
                    <select className={inputCls} value={f.productId} onChange={(e) => pickProduct(e.target.value)}>
                      <option value="">— sem vínculo —</option>
                      {catalogOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {brl(p.salePrice)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-black text-stone-800">Ingredientes</h4>
              <button className="text-xs font-bold text-amber-700 hover:underline" onClick={() => setLines([...lines, { key: String(Date.now()), ref: '', quantity: '' }])}>
                + Adicionar item
              </button>
            </div>
            <div className="rounded-xl border border-stone-200">
              <div className="grid grid-cols-12 gap-2 border-b border-stone-100 bg-stone-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                <span className="col-span-5">Item</span>
                <span className="col-span-2 text-right">Qtd</span>
                <span className="col-span-2 text-right">Custo un.</span>
                <span className="col-span-2 text-right">Total</span>
                <span className="col-span-1" />
              </div>
              <div className="divide-y divide-stone-100">
                {lines.map((l, idx) => {
                  const info = lineInfo(l, idx);
                  return (
                    <div key={l.key} className="grid grid-cols-12 items-center gap-2 px-3 py-1.5">
                      <select
                        className="col-span-5 w-full rounded-md border border-stone-200 bg-white px-1.5 py-1.5 text-xs"
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
                        <optgroup label="Massas, recheios e produtos prontos">
                          {options.subs.map((x) => (
                            <option key={x.id} value={`s:${x.id}`}>
                              {x.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <div className="col-span-2 flex items-center gap-1">
                        <input
                          className="w-full rounded-md border border-stone-200 px-1.5 py-1.5 text-right text-xs"
                          inputMode="decimal"
                          placeholder="0"
                          value={l.quantity}
                          onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                        />
                      </div>
                      <span className="col-span-2 text-right text-xs text-stone-500">
                        {brl(info.unitCost, 4)}
                        <span className="block text-[10px] text-stone-400">/{info.unit || 'un'}</span>
                      </span>
                      <span className="col-span-2 text-right text-xs font-bold text-stone-800">{brl(info.total)}</span>
                      <button className="col-span-1 flex justify-end text-stone-400 hover:text-red-500" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Remover item">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {lines.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-stone-400">Adicione insumos, equipamentos (minutos de uso) e mão de obra.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-stone-50 p-4">
            <h4 className="text-sm font-black text-stone-800">Resultado</h4>
            {segTotal > 0 && (
              <div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-200">
                  {segments.map(([label, v], i) => (
                    <div key={label} className={SEG_COLORS[i % SEG_COLORS.length]} style={{ width: `${(v / segTotal) * 100}%` }} title={`${label}: ${brl(v)}`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600">
                  {segments.map(([label, v], i) => (
                    <span key={label} className="inline-flex items-center gap-1">
                      <span className={`inline-block h-2 w-2 rounded-full ${SEG_COLORS[i % SEG_COLORS.length]}`} />
                      {label} {pct(v / segTotal)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Row k="Custo da receita" v={brl(live?.manufacturingCost ?? 0)} />
            <Row k="Custo por unidade" v={brl(cost, 4)} strong accent />
            {isProduct && (
              <>
                <Row k="Margem no balcão" v={`${brl(balcao.mc)} (${pct(balcao.mcPct)})`} warn={balcao.mcPct * 100 < targetPct} />
                <div className="rounded-lg border border-pink-200 bg-pink-50 p-3">
                  <p className="text-sm text-pink-900">
                    Para bater a meta de <strong>{targetPct}%</strong> no balcão, venda a <strong>{brl(targetPrice)}</strong>
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-pink-700 disabled:opacity-40"
                    disabled={targetPrice <= 0}
                    onClick={() => setPrice(targetPrice.toFixed(2))}
                  >
                    Usar este preço
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-50 text-left text-[10px] font-bold uppercase tracking-wide text-stone-500">
                      <tr>
                        <th className="px-2 py-1.5">Canal</th>
                        <th className="px-2 py-1.5 text-right">Taxa</th>
                        <th className="px-2 py-1.5 text-right">Lucro/un</th>
                        <th className="px-2 py-1.5 text-right">Margem</th>
                        <th className="px-2 py-1.5 text-right">Preço p/ meta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {(
                        [
                          ['Balcão', balcaoFee, balcao],
                          ['iFood', ifoodFee, ifood],
                          ['Revenda', resellerFee, revenda],
                        ] as Array<[string, number, ReturnType<typeof channelMargin>]>
                      ).map(([label, fee, m]) => (
                        <tr key={label}>
                          <td className="px-2 py-1.5 font-semibold text-stone-800">{label}</td>
                          <td className="px-2 py-1.5 text-right text-stone-500">{dec(fee, 1)}%</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${mcCls(m.mcPct)}`}>{brl(m.mc)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${mcCls(m.mcPct)}`}>{pct(m.mcPct)}</td>
                          <td className="px-2 py-1.5 text-right text-stone-700">{brl(priceForTargetMargin(cost, targetPct, fee))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-stone-400">
                  Calculado sobre {price > 0 ? 'o preço que você pratica' : `o preço sugerido pelo markup (${brl(live?.suggestedPrice ?? 0)})`}. Sugerido pelo markup: {brl(suggestedPrice(cost, toNum(f.markupPct), balcaoFee))}.
                </p>
              </>
            )}
            {!isProduct && <Row k="Custo por unidade de uso" v={brl(live?.unitCost ?? 0, 4)} strong accent />}
            {live?.warnings.length ? <div className="text-xs text-red-600">{live.warnings.join(' · ')}</div> : null}
          </div>

          <div>
            <button className="text-xs font-bold text-stone-500 hover:underline" onClick={() => setMore(!more)}>
              {more ? '− Menos opções' : '+ Mais opções'}
            </button>
            {more && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Unidade do rendimento">
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
                  <div />
                )}
                {!sheet && (
                  <Field label="Tipo">
                    <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}>
                      <option value="produto">Produto final</option>
                      <option value="massa">Massa (sub-ficha)</option>
                      <option value="recheio">Recheio (sub-ficha)</option>
                    </select>
                  </Field>
                )}
                <div className="col-span-2">
                  <Field label="Observações / modo de preparo">
                    <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
                  </Field>
                </div>
                <label className="col-span-2 flex items-center gap-2 text-sm text-stone-700">
                  <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ficha ativa
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-stone-200 bg-white px-5 py-3">
          {sheet && (
            <button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={() => void remove()}>
              Excluir
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {isProduct && (
              <button className={btnGhost} disabled={saving} onClick={() => void save(true)} title="Salva a ficha e grava o preço que pratico no produto vinculado">
                Salvar e aplicar preço
              </button>
            )}
            <button className={btnPrimary} disabled={saving} onClick={() => void save(false)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </aside>
    </div>
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
  const [simulating, setSimulating] = useState<IngredientDTO | null>(null);
  // Data de referência fixa na montagem (ler o relógio no render quebra a regra de pureza do React).
  const [now] = useState(() => Date.now());

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
                <tr key={i.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setEditing(i)}>
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
                  <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setSimulating(i)} className="rounded p-1.5 text-amber-600 hover:bg-amber-50" title="Simular novo preço de compra" disabled={i.usedIn === 0}>
                      <Calculator className="h-4 w-4" />
                    </button>
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
      {simulating && <SimulateModal ingredient={simulating} onClose={() => setSimulating(null)} />}
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

function SimulateModal({ ingredient, onClose }: { ingredient: IngredientDTO; onClose: () => void }) {
  const { toast } = useToast();
  const [price, setPrice] = useState(String(ingredient.purchasePrice));
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Array<{ sheetId: string; name: string; costBefore: number; costAfter: number; marginBefore: number; marginAfter: number }> | null>(null);
  async function run() {
    setBusy(true);
    try {
      setRows(await api(`/api/pricing/ingredients/${ingredient.id}/simulate`, 'POST', { purchasePrice: toNum(price) }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na simulação.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Simular: ${ingredient.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-stone-500">
        Hoje: {brl(ingredient.purchasePrice)} / {dec(ingredient.purchaseQty)} {ingredient.unit}. Informe o novo preço de compra para ver o efeito nos produtos (nada é gravado).
      </p>
      <div className="flex gap-2">
        <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className={btnPrimary} disabled={busy} onClick={() => void run()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simular
        </button>
      </div>
      {rows && (
        <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-stone-200">
          {rows.length === 0 ? (
            <div className="p-4 text-center text-sm text-stone-400">Nenhum produto muda de custo.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-[11px] font-bold uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.sheetId}>
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2 text-right">
                      {brl(r.costBefore)} → <strong>{brl(r.costAfter)}</strong>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${r.marginAfter < r.marginBefore ? 'text-red-600' : 'text-emerald-600'}`}>
                      {pct(r.marginBefore)} → {pct(r.marginAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
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
            <div key={r.id} onClick={() => setEditing(r)} className={`cursor-pointer rounded-xl border bg-white p-4 transition hover:shadow-sm ${r.active ? 'border-stone-200' : 'border-dashed opacity-60'}`}>
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
                <div className="flex" onClick={(e) => e.stopPropagation()}>
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
    resellerCommissionPct: String(data.settings.resellerCommissionPct),
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
        resellerCommissionPct: toNum(s.resellerCommissionPct),
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
            <li key={c.id} onClick={() => setEditing(c)} className={`flex cursor-pointer items-center justify-between rounded px-1 py-2 text-sm hover:bg-stone-50 ${c.active ? '' : 'opacity-40'}`}>
              <span className="text-stone-800">{c.name}</span>
              <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
          <Field label="Comissão da revenda (%)"><input className={inputCls} inputMode="decimal" value={s.resellerCommissionPct} onChange={set('resellerCommissionPct')} /></Field>
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
