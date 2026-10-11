'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Landmark, Loader2, X } from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { PixListDTO, PixRowDTO } from '@/server/services/pix';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.split('-').reverse().join('/');
const btn =
  'inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50';

const BADGE: Record<string, { label: string; cls: string }> = {
  alta: { label: 'Alta confiança', cls: 'bg-emerald-100 text-emerald-800' },
  media: { label: 'Provável', cls: 'bg-amber-100 text-amber-800' },
  baixa: { label: 'Só o valor bate', cls: 'bg-stone-100 text-stone-600' },
  info: { label: 'Valor diferente', cls: 'bg-sky-100 text-sky-800' },
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível concluir.'));
  const json = await res.json();
  return (json.data ?? json) as T;
}

export function PixPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const { toast, confirm } = useToast();
  const [data, setData] = useState<PixListDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pix');
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Não foi possível carregar os Pix.'));
      const json = await res.json();
      setData((json.data ?? json) as PixListDTO);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar Pix.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchBank() {
    setBusy('bank');
    try {
      const r = await post<{ fetched: number; withName: number; imported: number; duplicates: number }>('/api/pix/fetch', { days: 7 });
      toast(
        `${r.fetched} Pix nos últimos 7 dias · ${r.imported} novo(s)${r.imported > 0 && r.withName === 0 ? ' · o banco não informou o nome de quem pagou (sugestão só pelo valor)' : ''}.`,
        r.imported > 0 && r.withName === 0 ? 'info' : 'success',
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao consultar o banco.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function importText() {
    setBusy('import');
    try {
      const r = await post<{ format: string; found: number; imported: number; duplicates: number; ignored: number }>('/api/pix/import', { text });
      toast(
        r.found === 0
          ? 'Não encontrei Pix recebidos nesse arquivo. Confira se é o extrato da conta.'
          : `${r.imported} Pix novo(s) importado(s)${r.duplicates ? ` · ${r.duplicates} já estavam aqui` : ''}.`,
        r.found === 0 ? 'info' : 'success',
      );
      setShowImport(false);
      setText('');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao importar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    setShowImport(true);
  }

  async function settle(row: PixRowDTO, s: PixRowDTO['suggestions'][number]) {
    const ok = await confirm({
      title: 'Dar baixa com este Pix',
      message: `Pix de ${row.payerName ?? 'pagador não identificado'} (${brl(row.value)}) → ${s.customerLabel}, pedido(s) ${s.orderNumeros.map((n) => `#${n}`).join(', ')}. Baixar agora?`,
      confirmLabel: 'Dar baixa',
    });
    if (!ok) return;
    setBusy(`${row.id}:${s.transactionIds.join(',')}`);
    try {
      const r = await post<{ settled: number; boletosWrittenOff: number; warnings: string[] }>(`/api/pix/${row.id}/confirm`, { transactionIds: s.transactionIds });
      toast(
        `${r.settled} título(s) baixado(s)${r.boletosWrittenOff ? ` · ${r.boletosWrittenOff} boleto(s) cancelado(s) no banco` : ''}.`,
        r.warnings.length ? 'info' : 'success',
      );
      for (const w of r.warnings) toast(w, 'info');
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao dar baixa.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function ignore(row: PixRowDTO) {
    setBusy(`ign:${row.id}`);
    try {
      await post(`/api/pix/${row.id}/ignore`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao ignorar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-stone-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando Pix…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={busy !== null || !data.bank.available} onClick={() => void fetchBank()} title={data.bank.reason ?? 'Consulta os Pix recebidos dos últimos 7 dias no Sicoob'}>
          {busy === 'bank' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Buscar Pix no banco
        </button>
        <button className={btn} disabled={busy !== null} onClick={() => setShowImport(true)}>
          <FileUp className="h-4 w-4" /> Importar extrato (OFX/CSV)
        </button>
        <input ref={fileRef} type="file" accept=".ofx,.csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <span className="ml-auto text-xs text-stone-500">{data.recentlySettled} Pix baixado(s) nos últimos 30 dias</span>
      </div>
      {!data.bank.available && data.bank.reason && <p className="text-xs text-stone-500">Busca automática indisponível: {data.bank.reason} Enquanto isso, importe o extrato do Sicoobnet.</p>}

      {data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          Nenhum Pix pendente de baixa. Importe o extrato da conta ou busque no banco para ver as sugestões.
        </div>
      ) : (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-stone-900">{brl(row.value)}</div>
                  <div className="text-sm font-semibold text-stone-700">{row.payerName ?? 'Pagador não identificado'}</div>
                  <div className="text-xs text-stone-400">
                    {br(row.date)} · {row.source === 'sicoob' ? 'API Sicoob' : 'extrato'}
                    {row.description && row.source !== 'sicoob' ? ` · ${row.description}` : ''}
                  </div>
                </div>
                <button className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-red-600" disabled={busy !== null} onClick={() => void ignore(row)} title="Não é pagamento de cliente">
                  <X className="h-3.5 w-3.5" /> Ignorar
                </button>
              </div>

              {row.suggestions.length === 0 ? (
                <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs text-stone-500">Nenhum título em aberto combina com este Pix. Se for de um cliente, dê baixa pelo Financeiro.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {row.suggestions.map((s) => {
                    const key = `${row.id}:${s.transactionIds.join(',')}`;
                    const badge = BADGE[s.confidence]!;
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
                        <div className="min-w-[14rem] flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-stone-900">{s.customerLabel}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <div className="text-xs text-stone-500">
                            {s.titles.length > 0
                              ? s.titles.map((t) => `#${t.orderNumero}${t.dueDate ? ` venc. ${br(t.dueDate)}` : ''} ${brl(t.value)}`).join(' · ')
                              : `pedido(s) ${s.orderNumeros.map((n) => `#${n}`).join(', ')}`}
                          </div>
                          <div className="text-[11px] text-stone-400">{s.reasons.join(' · ')}</div>
                        </div>
                        {s.canSettle && (
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            disabled={busy !== null}
                            onClick={() => void settle(row, s)}
                          >
                            {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Dar baixa
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
              <h3 className="text-base font-black text-stone-900">Importar extrato da conta</h3>
              <button onClick={() => setShowImport(false)} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-stone-600">
                No Sicoobnet, exporte o extrato em <strong>OFX</strong> (ou CSV) e envie o arquivo aqui, ou cole o conteúdo. Só entram os Pix recebidos; reenviar o mesmo arquivo não duplica nada.
              </p>
              <div className="flex gap-2">
                <button className={btn} onClick={() => fileRef.current?.click()}>
                  <FileUp className="h-4 w-4" /> Escolher arquivo
                </button>
                {text && <span className="self-center text-xs text-stone-500">{text.length.toLocaleString('pt-BR')} caracteres carregados</span>}
              </div>
              <textarea className="h-48 w-full rounded-lg border border-stone-300 p-3 font-mono text-xs" placeholder="…ou cole aqui o conteúdo do extrato" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className={btn} onClick={() => setShowImport(false)}>
                  Cancelar
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50" disabled={!text.trim() || busy !== null} onClick={() => void importText()}>
                  {busy === 'import' && <Loader2 className="h-4 w-4 animate-spin" />} Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
