'use client';

/**
 * Faturamento do pedido: caminho do BOLETO (Sicoob).
 * Emissão é manual e só da gerência — este modal fica na tela de pedidos do admin.
 * O caminho da nota fiscal entra aqui na fase 4.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Copy, FileText, Landmark, Loader2, Plus, RefreshCw, X } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { responseErrorMessage } from '@/lib/errors';
import { isBoletoPaymentMethod } from '@/lib/payment-method';

export interface BillingOrder {
  id: string;
  numero: number;
  total: number;
  dueDate: string | null;
  paymentMethod: string;
  customerName: string | null;
  status: string;
}

interface Boleto {
  id: string;
  seuNumero: string;
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  pixCopiaECola: string | null;
  value: number;
  dueDate: string | null;
  status: 'pendente_registro' | 'registrado' | 'pago' | 'baixado' | 'cancelado' | 'erro';
  paidAt: string | null;
  paidValue: number | null;
  lastError: string | null;
  createdAt: string | null;
}

const STATUS: Record<Boleto['status'], { label: string; cls: string }> = {
  pendente_registro: { label: 'Registrando…', cls: 'bg-stone-100 text-stone-600' },
  registrado: { label: 'Em aberto', cls: 'bg-amber-50 text-amber-800 border border-amber-100' },
  pago: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  baixado: { label: 'Baixado', cls: 'bg-stone-100 text-stone-500' },
  cancelado: { label: 'Cancelado', cls: 'bg-stone-100 text-stone-500' },
  erro: { label: 'Erro', cls: 'bg-red-50 text-red-700 border border-red-100' },
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export default function OrderBillingModal({ order, onClose }: { order: BillingOrder; onClose: () => void }) {
  const { toast, confirm } = useToast();
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}/boletos`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao carregar boletos.'));
      const d = (await res.json()) as { data?: Boleto[] };
      setBoletos(d.data ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar boletos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [order.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (key: string, url: string, okMsg: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro na operação.'));
      toast(okMsg, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro na operação.', 'error');
    } finally {
      setBusy(null);
      await load();
    }
  };

  const issue = async () => {
    const warn = !isBoletoPaymentMethod(order.paymentMethod)
      ? `\n\nAtenção: a forma de pagamento deste pedido é "${order.paymentMethod}", não boleto.`
      : '';
    const ok = await confirm({
      title: 'Gerar boleto',
      message: `Registrar no Sicoob um boleto de ${brl(order.total)} com vencimento em ${br(order.dueDate)} para ${order.customerName ?? 'o cliente'}?${warn}`,
      confirmLabel: 'Gerar boleto',
      cancelLabel: 'Voltar',
    });
    if (ok) await call('issue', `/api/orders/${order.id}/boletos`, 'Boleto registrado no Sicoob.');
  };

  const writeOff = async (b: Boleto) => {
    const ok = await confirm({
      title: 'Dar baixa no boleto',
      message: `Cancelar o boleto ${b.seuNumero} no banco? O cliente não conseguirá mais pagar este boleto.`,
      confirmLabel: 'Dar baixa',
      cancelLabel: 'Voltar',
      danger: true,
    });
    if (ok) await call(`off-${b.id}`, `/api/boletos/${b.id}/baixar`, 'Boleto baixado.');
  };

  const openPdf = async (b: Boleto) => {
    setBusy(`pdf-${b.id}`);
    try {
      const res = await fetch(`/api/boletos/${b.id}/pdf`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao abrir o PDF.'));
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao abrir o PDF.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copiado.`, 'success');
    } catch {
      toast('Não consegui copiar. Selecione e copie manualmente.', 'error');
    }
  };

  const hasActive = boletos.some((b) => ['pendente_registro', 'registrado', 'pago'].includes(b.status));
  const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 text-[11px] font-bold hover:bg-stone-50 disabled:opacity-50 cursor-pointer';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-amber-600" />
            <h3 className="font-black text-stone-800">Faturamento — Pedido #{order.numero}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-amber-700 uppercase tracking-widest">Boleto</p>
              <p className="text-[11px] text-stone-500">
                {brl(order.total)} · vence {br(order.dueDate)} · {order.paymentMethod}
              </p>
            </div>
            {!hasActive && order.status !== 'cancelado' && (
              <button onClick={issue} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
                {busy === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Gerar boleto
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-6 text-stone-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : boletos.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-4">Nenhum boleto gerado para este pedido.</p>
          ) : (
            <ul className="space-y-3">
              {boletos.map((b) => (
                <li key={b.id} className="rounded-xl border border-stone-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-stone-600">{b.seuNumero}{b.nossoNumero ? ` · nº ${b.nossoNumero}` : ''}</span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    {brl(b.value)} · vence {br(b.dueDate)}
                    {b.status === 'pago' && ` · pago em ${br(b.paidAt)}${b.paidValue != null ? ` (${brl(b.paidValue)})` : ''}`}
                  </p>
                  {b.lastError && <p className="text-[11px] text-red-700 bg-red-50 rounded p-2">{b.lastError}</p>}
                  {b.linhaDigitavel && (
                    <button onClick={() => copy(b.linhaDigitavel!, 'Linha digitável')} className="w-full text-left text-[11px] font-mono bg-stone-50 rounded p-2 hover:bg-stone-100 cursor-pointer break-all" title="Copiar">
                      {b.linhaDigitavel}
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {b.linhaDigitavel && (
                      <button className={btn} onClick={() => copy(b.linhaDigitavel!, 'Linha digitável')}><Copy className="h-3.5 w-3.5" /> Linha digitável</button>
                    )}
                    {b.pixCopiaECola && (
                      <button className={btn} onClick={() => copy(b.pixCopiaECola!, 'Pix copia e cola')}><Copy className="h-3.5 w-3.5" /> Pix copia e cola</button>
                    )}
                    {['registrado', 'pago'].includes(b.status) && (
                      <button className={btn} disabled={busy !== null} onClick={() => openPdf(b)}>
                        {busy === `pdf-${b.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PDF
                      </button>
                    )}
                    {b.status === 'registrado' && (
                      <>
                        <button className={btn} disabled={busy !== null} onClick={() => call(`ref-${b.id}`, `/api/boletos/${b.id}/atualizar`, 'Status atualizado.')}>
                          {busy === `ref-${b.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar status
                        </button>
                        <button className={`${btn} text-red-700`} disabled={busy !== null} onClick={() => writeOff(b)}>
                          <Ban className="h-3.5 w-3.5" /> Dar baixa
                        </button>
                      </>
                    )}
                    {(b.status === 'erro' || b.status === 'pendente_registro') && (
                      <button className={btn} disabled={busy !== null} onClick={() => call(`off-${b.id}`, `/api/boletos/${b.id}/baixar`, 'Tentativa descartada.')}>
                        <X className="h-3.5 w-3.5" /> Descartar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-stone-100 pt-3">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Nota fiscal</p>
            <p className="text-[11px] text-stone-400">Em breve.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
