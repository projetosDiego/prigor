'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MessageCircle, X } from 'lucide-react';

import { errorMessage } from '@/lib/errors';
import { api, fmtDateTime, inputCls, Modal, STATUS_LABEL } from './parts';

interface Submission {
  id: string;
  status: string;
  taskTitle: string;
  taskPoints: number;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberPhoneDigits: string;
  memberNote: string | null;
  reviewNote: string | null;
  points: number;
  createdAt: string;
  reviewedAt: string | null;
}

const REJECT_REASONS = [
  'Não encontramos a marcação da @docesprigor no print.',
  'O print não mostra a tarefa concluída.',
  'Imagem ilegível. Envie um print mais nítido.',
  'Print repetido ou de outra pessoa.',
];

export default function ReviewsTab({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'recusado'>('pendente');
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await api<{ data: Submission[] }>(`/api/clube/envios?status=${status}`);
      setRows(json.data);
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, approve: boolean, note: string | null) => {
    setBusy(id);
    try {
      await api(`/api/clube/envios/${id}`, { body: { approve, note } }, 'Erro ao analisar.');
      setRejecting(null);
      await load();
      onChanged();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['pendente', 'aprovado', 'recusado'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${status === s ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
          >
            {STATUS_LABEL[s]}s
          </button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
      </div>

      {!loading && rows.length === 0 && (
        <p className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          {status === 'pendente' ? 'Nenhum print aguardando análise. 🎉' : 'Nada por aqui.'}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-stone-200 bg-white overflow-hidden flex flex-col">
            <button onClick={() => setZoom(r.id)} className="block bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/clube/envios/${r.id}/imagem`} alt="Print" className="h-56 w-full object-contain" loading="lazy" />
            </button>
            <div className="p-3 space-y-2 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-stone-900">{r.taskTitle}</p>
                  <p className="text-xs text-stone-500">
                    {r.memberName} ·{' '}
                    <a href={`https://wa.me/55${r.memberPhoneDigits}`} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold">
                      {r.memberPhone}
                    </a>
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">+{r.taskPoints}</span>
              </div>
              {r.memberNote && <p className="rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-700">“{r.memberNote}”</p>}
              <p className="text-[11px] text-stone-400">Enviado {fmtDateTime(r.createdAt)}</p>
              {r.reviewNote && <p className="text-[11px] text-red-600">{r.reviewNote}</p>}
              {r.status === 'pendente' && (
                <div className="mt-auto flex gap-2 pt-1">
                  <button
                    onClick={() => setRejecting(r)}
                    disabled={busy !== null}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" /> Recusar
                  </button>
                  <button
                    onClick={() => void review(r.id, true, null)}
                    disabled={busy !== null}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/clube/envios/${zoom}/imagem`} alt="Print" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
      {rejecting && <RejectModal sub={rejecting} busy={busy === rejecting.id} onClose={() => setRejecting(null)} onConfirm={(n) => void review(rejecting.id, false, n)} />}
    </div>
  );
}

function RejectModal({ sub, busy, onClose, onConfirm }: { sub: Submission; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState(REJECT_REASONS[0]!);
  return (
    <Modal title={`Recusar — ${sub.taskTitle}`} onClose={onClose}>
      <div className="space-y-2">
        {REJECT_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setNote(r)}
            className={`block w-full rounded-lg border px-3 py-2 text-left text-xs ${note === r ? 'border-amber-600 bg-amber-50 font-bold' : 'border-stone-200'}`}
          >
            {r}
          </button>
        ))}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} className={inputCls} />
        <p className="text-[11px] text-stone-500">O cliente vê esse motivo e pode mandar o print de novo.</p>
      </div>
      <div className="flex gap-2">
        <a
          href={`https://wa.me/55${sub.memberPhoneDigits}?text=${encodeURIComponent(`Oi, ${sub.memberName.split(' ')[0]}! Sobre a tarefa "${sub.taskTitle}" do Clube Prigor: ${note}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700"
        >
          <MessageCircle className="h-4 w-4" /> Avisar
        </a>
        <button
          onClick={() => onConfirm(note)}
          disabled={busy || !note.trim()}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Recusar print
        </button>
      </div>
    </Modal>
  );
}
