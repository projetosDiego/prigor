'use client';

import React, { useCallback, useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Gift,
  ListChecks,
  Loader2,
  MessageCircle,
  Package,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings,
  Trophy,
  Truck,
} from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';
import { CLUBE_BASE_URL } from '@/lib/clube';

import { buildDisplayHtml, type DisplayPrize } from './display-art';
import MemberDrawer from './member-drawer';
import { api, fmtUnits, Modal } from './parts';
import PrizesTab from './prizes';
import ReviewsTab from './reviews';
import SettingsTab from './settings';
import TasksTab from './tasks';

interface PointStock {
  prizeId: string;
  title: string;
  stock: number;
  committed: number;
  free: number;
}

interface PointRow {
  customerId: string;
  name: string;
  neighborhood: string | null;
  code: string | null;
  signups: number;
  redemptions: number;
  pendingUnits: number;
  stocks: PointStock[];
}

interface MemberRow {
  id: string;
  name: string;
  phone: string;
  phoneDigits: string;
  neighborhood: string | null;
  marketingConsent: boolean;
  whatsappConfirmed: boolean;
  phoneVerified: boolean;
  signupPointName: string | null;
  welcomeTitle: string | null;
  welcomeStatus: string | null;
  points: number;
  createdAt: string;
}

interface Overview {
  totals: { members: number; withConsent: number; redeemed: number; pendingUnits: number; pendingReviews: number };
  points: PointRow[];
  members: MemberRow[];
}

interface CustomerHit {
  id: string;
  tradeName: string;
  neighborhood?: string | null;
}

type Tab = 'geral' | 'analises' | 'premios' | 'tarefas' | 'config';

const pointUrl = (code: string) => `${CLUBE_BASE_URL}/p/${code}`;

function qrSvg(text: string, cellSize = 8): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 2, scalable: true });
}

export default function ClubeAdminPage() {
  const [tab, setTab] = useState<Tab>('geral');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [qrPoint, setQrPoint] = useState<PointRow | null>(null);
  const [settlePoint, setSettlePoint] = useState<PointRow | null>(null);
  const [stockPoint, setStockPoint] = useState<PointRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);

  const load = useCallback(async (search = '') => {
    try {
      setLoading(true);
      setError(null);
      setData(await api<Overview>(`/api/clube${search ? `?search=${encodeURIComponent(search)}` : ''}`, undefined, 'Erro ao carregar o Clube.'));
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => void load(memberSearch);

  const toggleWhatsapp = async (m: MemberRow) => {
    try {
      await api(`/api/clube/membros/${m.id}/whatsapp`, { body: { confirmed: !m.whatsappConfirmed } }, 'Erro ao atualizar.');
      reload();
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  const t = data?.totals;
  const tabs: [Tab, string, React.ReactNode][] = [
    ['geral', 'Pontos e clientes', <Gift key="g" className="h-4 w-4" />],
    ['analises', `Análises${t?.pendingReviews ? ` (${t.pendingReviews})` : ''}`, <ClipboardCheck key="a" className="h-4 w-4" />],
    ['premios', 'Prêmios', <Trophy key="p" className="h-4 w-4" />],
    ['tarefas', 'Tarefas', <ListChecks key="t" className="h-4 w-4" />],
    ['config', 'Configurações', <Settings key="c" className="h-4 w-4" />],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-amber-700" />
            Clube Prigor
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Clientes finais dos pontos de revenda: prêmios, pontos e tarefas. O cliente resgata sozinho no ponto.
          </p>
        </div>
        {tab === 'geral' && (
          <div className="flex gap-2">
            <a
              href="/api/clube/csv"
              className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-4 py-2 text-xs font-bold text-stone-700"
            >
              <Download className="h-4 w-4" /> Exportar base (CSV)
            </a>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Ativar ponto
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 border border-stone-200 w-fit">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              tab === key ? 'bg-amber-700 text-white' : 'text-stone-600 hover:bg-stone-100'
            } ${key === 'analises' && t?.pendingReviews ? 'ring-2 ring-amber-300' : ''}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {tab === 'analises' && <ReviewsTab onChanged={reload} />}
      {tab === 'premios' && <PrizesTab />}
      {tab === 'tarefas' && <TasksTab />}
      {tab === 'config' && <SettingsTab />}

      {tab === 'geral' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Cadastrados" value={t ? String(t.members) : '—'} />
            <Kpi label="Aceitam WhatsApp" value={t ? String(t.withConsent) : '—'} />
            <Kpi label="Prêmios retirados" value={t ? String(t.redeemed) : '—'} />
            <Kpi label="Brownies a repor" value={t ? fmtUnits(t.pendingUnits) : '—'} highlight={!!t && t.pendingUnits > 0} />
          </div>

          <section className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-stone-800">Pontos no Clube</h3>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
            </div>
            {data && data.points.length === 0 ? (
              <p className="p-6 text-center text-xs text-stone-500">
                Nenhum ponto ativado. Clique em <b>Ativar ponto</b> para gerar o QR Code do balcão.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-stone-500 uppercase text-[10px]">
                  <tr>
                    <th className="text-left px-4 py-2">Ponto</th>
                    <th className="text-right px-4 py-2">Cadastros</th>
                    <th className="text-right px-4 py-2">Retiradas</th>
                    <th className="text-left px-4 py-2">Brindes livres</th>
                    <th className="text-right px-4 py-2">A repor</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.points.map((p) => (
                    <tr key={p.customerId} className="border-t border-stone-100">
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-stone-800">{p.name}</p>
                        <p className="text-[10px] text-stone-400">
                          {p.neighborhood ?? ''}
                          {p.code ? '' : ' · QR desativado'}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{p.signups}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{p.redemptions}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {p.stocks.map((s) => (
                            <span
                              key={s.prizeId}
                              title={`${s.title}: ${s.stock} enviadas, ${s.committed} ganhas/retiradas`}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                s.free === 0 ? 'bg-red-100 text-red-700' : s.free <= 2 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {s.title.split(' ')[0]} {s.free}/{s.stock}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-black ${p.pendingUnits > 0 ? 'text-amber-700' : 'text-stone-400'}`}>
                        {fmtUnits(p.pendingUnits)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {p.code && (
                            <button
                              onClick={() => setQrPoint(p)}
                              className="flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1.5 font-bold text-stone-700 hover:bg-stone-50"
                            >
                              <QrCode className="h-3.5 w-3.5" /> QR
                            </button>
                          )}
                          {p.stocks.length > 0 && (
                            <button
                              onClick={() => setStockPoint(p)}
                              className="flex items-center gap-1 rounded-md border border-stone-200 px-2.5 py-1.5 font-bold text-stone-700 hover:bg-stone-50"
                            >
                              <Package className="h-3.5 w-3.5" /> Estoque
                            </button>
                          )}
                          <button
                            onClick={() => setSettlePoint(p)}
                            disabled={p.pendingUnits <= 0}
                            className="flex items-center gap-1 rounded-md bg-amber-700 px-2.5 py-1.5 font-bold text-white hover:bg-amber-800 disabled:bg-stone-200 disabled:text-stone-400"
                          >
                            <Truck className="h-3.5 w-3.5" /> Repor
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
            <div className="px-4 py-3 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-stone-800">Clientes do Clube</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  reload();
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Nome ou WhatsApp"
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs outline-none focus:border-amber-600"
                />
                <button className="rounded-lg bg-stone-800 p-2 text-white">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-stone-50 text-stone-500 uppercase text-[10px]">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Ponto de cadastro</th>
                  <th className="text-left px-4 py-2">Prêmio do cadastro</th>
                  <th className="text-right px-4 py-2">Pontos</th>
                  <th className="text-left px-4 py-2">WhatsApp</th>
                  <th className="text-left px-4 py-2">Desde</th>
                </tr>
              </thead>
              <tbody>
                {data?.members.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100 hover:bg-amber-50/40 cursor-pointer" onClick={() => setMemberId(m.id)}>
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-stone-800">{m.name}</p>
                      <p className="text-[10px] text-stone-400">{m.neighborhood ?? ''}</p>
                    </td>
                    <td className="px-4 py-2.5 text-stone-600">{m.signupPointName ?? 'Direto no site'}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-stone-700">{m.welcomeTitle ?? '—'}</p>
                      {m.welcomeStatus && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            m.welcomeStatus === 'usado' ? 'bg-emerald-100 text-emerald-700' : m.welcomeStatus === 'anulado' ? 'bg-stone-100 text-stone-500' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {m.welcomeStatus === 'usado' ? 'Retirado' : m.welcomeStatus === 'anulado' ? '2ª via emitida' : 'Disponível'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-amber-700">{m.points}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/55${m.phoneDigits}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> {m.phone}
                        </a>
                        <button
                          onClick={() => void toggleWhatsapp(m)}
                          title={m.whatsappConfirmed ? 'Número confirmado (clique para desfazer)' : 'Marcar como confirmado'}
                          className={m.whatsappConfirmed ? 'text-emerald-600' : 'text-stone-300 hover:text-stone-500'}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        {m.phoneVerified && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">SMS ✓</span>}
                        {!m.marketingConsent && <span className="text-[10px] text-stone-400">sem autorização</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">{new Date(m.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
                {data && data.members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-stone-500">
                      Nenhum cliente ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {showAdd && (
        <AddPointModal
          onClose={() => setShowAdd(false)}
          onEnabled={async (row) => {
            setShowAdd(false);
            await load(memberSearch);
            setQrPoint(row);
          }}
        />
      )}
      {qrPoint?.code && <QrModal point={qrPoint} onClose={() => setQrPoint(null)} />}
      {stockPoint && (
        <StockModal
          point={stockPoint}
          onClose={() => setStockPoint(null)}
          onSaved={() => {
            setStockPoint(null);
            reload();
          }}
        />
      )}
      {settlePoint && (
        <SettleModal
          point={settlePoint}
          onClose={() => setSettlePoint(null)}
          onDone={async () => {
            setSettlePoint(null);
            await load(memberSearch);
          }}
        />
      )}
      {memberId && <MemberDrawer memberId={memberId} onClose={() => setMemberId(null)} onChanged={reload} />}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${highlight ? 'text-amber-800' : 'text-stone-900'}`}>{value}</p>
    </div>
  );
}

function StockModal({ point, onClose, onSaved }: { point: PointRow; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(point.stocks.map((s) => [s.prizeId, String(s.stock)])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      for (const s of point.stocks) {
        const q = Number(values[s.prizeId] ?? s.stock);
        if (q !== s.stock) await api(`/api/clube/pontos/${point.customerId}/estoque`, { method: 'PUT', body: { prizeId: s.prizeId, quantity: q } });
      }
      onSaved();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Estoque de brindes — ${point.name}`} onClose={onClose}>
      <p className="text-xs text-stone-500">
        Quantas unidades você entregou neste ponto. &quot;Comprometidas&quot; = já retiradas + ganhas e ainda dentro do prazo. Quando as
        livres zeram, o brinde sai do sorteio deste ponto.
      </p>
      <table className="w-full text-xs">
        <thead className="text-stone-500 uppercase text-[10px]">
          <tr>
            <th className="text-left py-1">Brinde</th>
            <th className="text-right py-1">Comprometidas</th>
            <th className="text-right py-1">Livres</th>
            <th className="text-right py-1">Entregues</th>
          </tr>
        </thead>
        <tbody>
          {point.stocks.map((s) => (
            <tr key={s.prizeId} className="border-t border-stone-100">
              <td className="py-2 font-bold text-stone-800">{s.title}</td>
              <td className="py-2 text-right">{s.committed}</td>
              <td className="py-2 text-right font-black">{s.free}</td>
              <td className="py-2 text-right">
                <input
                  value={values[s.prizeId] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [s.prizeId]: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-right"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => void save()} disabled={saving} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar estoque
      </button>
    </Modal>
  );
}

function AddPointModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: (row: PointRow) => void | Promise<void> }) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (term.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(term)}&pageSize=8`);
      const json = (await res.json()) as { data?: CustomerHit[] };
      if (res.ok) setHits(json.data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);

  const enable = async (c: CustomerHit) => {
    setBusy(c.id);
    try {
      const res = await fetch(`/api/clube/pontos/${c.id}`, { method: 'POST' });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao ativar o ponto.'));
      const { code } = json as { code: string };
      await onEnabled({
        customerId: c.id,
        name: c.tradeName,
        neighborhood: c.neighborhood ?? null,
        code,
        signups: 0,
        redemptions: 0,
        pendingUnits: 0,
        stocks: [],
      });
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Ativar ponto no Clube" onClose={onClose}>
      <p className="text-xs text-stone-500">Escolha o cliente revendedor. Ele ganha um QR Code próprio para o balcão.</p>
      <input
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar cliente..."
        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600"
      />
      <ul className="max-h-72 overflow-y-auto divide-y divide-stone-100">
        {(term.trim().length < 2 ? [] : hits).map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-bold text-stone-800">{c.tradeName}</p>
              <p className="text-[10px] text-stone-400">{c.neighborhood ?? ''}</p>
            </div>
            <button
              onClick={() => void enable(c)}
              disabled={busy !== null}
              className="flex items-center gap-1 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />} Ativar
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function QrModal({ point, onClose }: { point: PointRow; onClose: () => void }) {
  const url = pointUrl(point.code!);
  const svg = qrSvg(url);

  const print = async () => {
    // Abre a janela já no clique (senão o navegador bloqueia) e preenche depois.
    const w = window.open('', '_blank', 'width=480,height=760');
    if (!w) return;
    w.document.write('<p style="font-family:sans-serif;padding:16px">Gerando o display...</p>');
    try {
      const { data } = await api<{ data: (DisplayPrize & { active: boolean; drawWeight: number })[] }>('/api/clube/premios');
      const prizes = data.filter((p) => p.active && p.drawWeight > 0);
      const html = buildDisplayHtml({
        pointName: point.name,
        qrSvg: qrSvg(url),
        logoUrl: `${window.location.origin}/logo.png`,
        prizes,
      });
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (err: unknown) {
      w.close();
      alert(errorMessage(err));
    }
  };

  return (
    <Modal title={`QR do balcão — ${point.name}`} onClose={onClose}>
      <div className="mx-auto w-56 rounded-xl border border-stone-200 p-2" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-center text-[11px] text-stone-500 break-all">{url}</p>
      <div className="flex gap-2">
        <button
          onClick={() => void navigator.clipboard.writeText(url)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 py-2 text-xs font-bold text-stone-700"
        >
          <Copy className="h-4 w-4" /> Copiar link
        </button>
        <button
          onClick={() => void print()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2 text-xs font-bold text-white"
        >
          <Printer className="h-4 w-4" /> Imprimir display 10x15
        </button>
      </div>
      <p className="text-[11px] text-stone-500">
        Esse QR é <b>só deste ponto</b>: os cadastros e resgates feitos por ele contam para {point.name}.
      </p>
    </Modal>
  );
}

function SettleModal({ point, onClose, onDone }: { point: PointRow; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/clube/pontos/${point.customerId}/reposicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim() ? Number(orderNumber) : null }),
      });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao registrar a reposição.'));
      await onDone();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Repor bonificação — ${point.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-amber-50 p-4 text-center">
          <p className="text-3xl font-black text-amber-800">{fmtUnits(point.pendingUnits)}</p>
          <p className="text-xs font-semibold text-amber-700">brownie(s) entregues de presente pelo ponto</p>
        </div>
        <p className="text-xs text-stone-600">
          Lance os brownies bonificados no próximo pedido do cliente (item com preço zero) e marque aqui como repostos.
        </p>
        <label className="block">
          <span className="text-xs font-bold text-stone-600">Nº do pedido da reposição (opcional)</span>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-amber-600"
            placeholder="Ex.: 1234"
          />
        </label>
        <button
          disabled={saving}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Marcar como reposto
        </button>
      </form>
    </Modal>
  );
}
