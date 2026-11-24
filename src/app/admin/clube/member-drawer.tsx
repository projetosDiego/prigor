'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, KeyRound, Loader2, MessageCircle, RefreshCcw, Star, Trash2, X } from 'lucide-react';

import { errorMessage } from '@/lib/errors';
import { api, Field, fmtDate, fmtDateTime, inputCls, Modal, SOURCE_LABEL, STATUS_LABEL } from './parts';
import type { Prize } from './prizes';

interface MemberDetail {
  id: string;
  name: string;
  phone: string;
  phoneDigits: string;
  neighborhood: string | null;
  marketingConsent: boolean;
  whatsappConfirmed: boolean;
  phoneVerified: boolean;
  hasPin: boolean;
  createdAt: string;
  signupPointName: string | null;
  referredByName: string | null;
  points: number;
  rewards: {
    id: string;
    title: string;
    source: string;
    status: string;
    expired: boolean;
    expiresAt: string | null;
    redeemedAt: string | null;
    redeemPointName: string | null;
    reservedPointName: string | null;
    settled: boolean;
    note: string | null;
    createdAt: string;
  }[];
  history: { delta: number; reason: string; description: string | null; createdAt: string }[];
}

type Action = { kind: 'pin'; pin: string } | { kind: 'points' } | { kind: 'grant' } | { kind: 'reissue'; rewardId: string; title: string } | null;

export default function MemberDrawer({ memberId, onClose, onChanged }: { memberId: string; onClose: () => void; onChanged: () => void }) {
  const [m, setM] = useState<MemberDetail | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setM(await api<MemberDetail>(`/api/clube/membros/${memberId}`));
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const done = async () => {
    setAction(null);
    await load();
    onChanged();
  };

  const resetPin = async () => {
    if (!confirm('Gerar um PIN novo para este cliente? O PIN antigo deixa de funcionar.')) return;
    setBusy(true);
    try {
      const { pin } = await api<{ pin: string }>(`/api/clube/membros/${memberId}/pin`, { body: {} });
      setAction({ kind: 'pin', pin });
      await load();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!m) return;
    const ok = confirm(
      `Excluir ${m.name} (${m.phone}) do Clube?\n\nApaga o cadastro, os prêmios, os pontos e os prints. Bonificação ainda não reposta deste cliente some do "a repor". Não dá para desfazer.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/clube/membros/${memberId}`, { method: 'DELETE' });
      onChanged();
      onClose();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-stone-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
          <h3 className="text-base font-black text-stone-900">{m?.name ?? 'Carregando...'}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!m ? (
          <Loader2 className="m-6 h-5 w-5 animate-spin text-stone-400" />
        ) : (
          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-1 text-xs text-stone-600">
              <p>
                <a href={`https://wa.me/55${m.phoneDigits}`} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">
                  {m.phone}
                </a>
                {m.neighborhood ? ` · ${m.neighborhood}` : ''}
              </p>
              <p>
                Cadastro em {fmtDate(m.createdAt)} · {m.signupPointName ?? 'direto no site'}
                {m.referredByName ? ` · indicado por ${m.referredByName}` : ''}
              </p>
              <p>
                {m.hasPin ? 'Tem PIN' : 'Sem PIN'} · {m.marketingConsent ? 'aceita WhatsApp' : 'não autorizou WhatsApp'}
                {m.phoneVerified ? ' · celular confirmado por SMS' : ''}
                {m.whatsappConfirmed ? ' · WhatsApp confirmado' : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => void resetPin()} disabled={busy} className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white p-3 text-[11px] font-bold text-stone-700 hover:bg-stone-50">
                <KeyRound className="h-5 w-5 text-amber-700" /> Novo PIN
              </button>
              <button onClick={() => setAction({ kind: 'points' })} className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white p-3 text-[11px] font-bold text-stone-700 hover:bg-stone-50">
                <Star className="h-5 w-5 text-amber-700" /> Ajustar pontos
              </button>
              <button onClick={() => setAction({ kind: 'grant' })} className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-white p-3 text-[11px] font-bold text-stone-700 hover:bg-stone-50">
                <Gift className="h-5 w-5 text-amber-700" /> Dar prêmio
              </button>
            </div>

            <section className="rounded-xl border border-stone-200 bg-white">
              <h4 className="border-b border-stone-100 px-4 py-2.5 text-xs font-black text-stone-800">Prêmios</h4>
              <ul className="divide-y divide-stone-100">
                {m.rewards.map((r) => {
                  const canReissue = r.status === 'usado' || r.expired;
                  return (
                    <li key={r.id} className="px-4 py-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`font-bold ${r.status === 'anulado' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{r.title}</p>
                          <p className="text-[11px] text-stone-500">
                            {SOURCE_LABEL[r.source] ?? r.source} · {STATUS_LABEL[r.status] ?? r.status}
                            {r.expired ? ' (vencido)' : ''}
                            {r.redeemedAt ? ` em ${r.redeemPointName ?? '?'} ${fmtDateTime(r.redeemedAt)}` : ''}
                            {r.reservedPointName && r.status === 'disponivel' ? ` · reservado em ${r.reservedPointName}` : ''}
                            {r.expiresAt && r.status === 'disponivel' ? ` · até ${fmtDate(r.expiresAt)}` : ''}
                            {r.status === 'usado' ? (r.settled ? ' · reposto' : ' · a repor') : ''}
                          </p>
                          {r.note && <p className="text-[11px] text-stone-400">{r.note}</p>}
                        </div>
                        {canReissue && (
                          <button
                            onClick={() => setAction({ kind: 'reissue', rewardId: r.id, title: r.title })}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-800"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" /> 2ª via
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white">
              <h4 className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 text-xs font-black text-stone-800">
                Pontos <span className="text-amber-700">{m.points}</span>
              </h4>
              <ul className="divide-y divide-stone-100">
                {m.history.length === 0 && <li className="px-4 py-3 text-xs text-stone-400">Sem movimentação.</li>}
                {m.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                    <span className="text-stone-600">
                      {h.description ?? h.reason} <span className="text-stone-400">· {fmtDate(h.createdAt)}</span>
                    </span>
                    <span className={`font-black ${h.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {h.delta > 0 ? '+' : ''}
                      {h.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <button
              onClick={() => void remove()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Excluir do Clube
            </button>
          </div>
        )}
      </aside>

      {m && action?.kind === 'pin' && (
        <Modal title="PIN novo gerado" onClose={() => setAction(null)}>
          <p className="text-center text-4xl font-black tracking-[0.4em] text-stone-900">{action.pin}</p>
          <p className="text-xs text-stone-500 text-center">Mande para o cliente. Ele não fica salvo em lugar nenhum.</p>
          <div className="flex gap-2">
            <button onClick={() => void navigator.clipboard.writeText(action.pin)} className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-stone-300 py-2 text-xs font-bold">
              <Copy className="h-4 w-4" /> Copiar
            </button>
            <a
              href={`https://wa.me/55${m.phoneDigits}?text=${encodeURIComponent(`Oi, ${m.name.split(' ')[0]}! Seu novo PIN do Clube Prigor é ${action.pin}. Entre com seu celular e esse PIN.`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white"
            >
              <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
            </a>
          </div>
        </Modal>
      )}
      {action?.kind === 'points' && <PointsModal memberId={memberId} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'grant' && <GrantModal memberId={memberId} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'reissue' && <ReissueModal rewardId={action.rewardId} title={action.title} onClose={() => setAction(null)} onDone={done} />}
    </div>
  );
}

function PointsModal({ memberId, onClose, onDone }: { memberId: string; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/clube/membros/${memberId}/pontos`, { body: { delta: Number(delta), description } });
      onDone();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Ajustar pontos" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Pontos" hint="Use negativo para tirar (ex.: -50)">
          <input value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))} required className={inputCls} />
        </Field>
        <Field label="Motivo (o cliente vê no extrato)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} required className={inputCls} placeholder="Bônus de Natal" />
        </Field>
        <button disabled={busy} className="w-full rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Salvar
        </button>
      </form>
    </Modal>
  );
}

function GrantModal({ memberId, onClose, onDone }: { memberId: string; onClose: () => void; onDone: () => void }) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [prizeId, setPrizeId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ data: Prize[] }>('/api/clube/premios').then((j) => {
      const list = j.data.filter((p) => p.active && p.stockPerPoint === null);
      setPrizes(list);
      setPrizeId(list[0]?.id ?? '');
    });
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/clube/membros/${memberId}/premio`, { body: { prizeId, note } });
      onDone();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Dar prêmio ao cliente" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Prêmio">
          <select value={prizeId} onChange={(e) => setPrizeId(e.target.value)} className={inputCls}>
            {prizes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observação (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Cortesia, compensação..." />
        </Field>
        <button disabled={busy || !prizeId} className="w-full rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Dar prêmio
        </button>
      </form>
    </Modal>
  );
}

function ReissueModal({ rewardId, title, onClose, onDone }: { rewardId: string; title: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('Problema no resgate no balcão (chamado pelo WhatsApp)');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/clube/cupons/${rewardId}/segunda-via`, { body: { reason } });
      onDone();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Segunda via — ${title}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-xs text-stone-600">
          O prêmio antigo é anulado (sai do &quot;a repor&quot; do ponto e libera o estoque, se for brinde) e o cliente recebe um novo,
          disponível para usar.
        </p>
        <Field label="Motivo">
          <input value={reason} onChange={(e) => setReason(e.target.value)} required className={inputCls} />
        </Field>
        <button disabled={busy} className="w-full rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          Liberar segunda via
        </button>
      </form>
    </Modal>
  );
}
