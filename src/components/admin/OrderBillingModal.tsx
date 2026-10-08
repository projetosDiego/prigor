'use client';

/**
 * Faturamento do pedido: dois caminhos independentes e manuais (só gerência):
 *  - BOLETO (Sicoob);
 *  - NOTA FISCAL (NF-e via provedor fiscal).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Copy, FileCode, FileText, Landmark, Loader2, Plus, Receipt, RefreshCw, X } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { saveResponseAsFile } from '@/lib/download';
import { responseErrorMessage } from '@/lib/errors';
import { isBoletoPaymentMethod } from '@/lib/payment-method';

export interface BillingOrder {
  id: string;
  customerId: string;
  numero: number;
  total: number;
  dueDate: string | null;
  paymentMethod: string;
  customerName: string | null;
  status: string;
  /** Link secreto para o cliente baixar boleto/NF (só gestão recebe). */
  docsLink?: string | null;
  /** CNPJ que já faturou o pedido (se houver). */
  issuerId?: string | null;
  /** CNPJ padrão do cliente. */
  customerDefaultIssuerId?: string | null;
}

/** Empresa emissora (CNPJ) — só o necessário para escolher no faturamento. */
interface IssuerOption {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  isDefault: boolean;
  integrations: { invoice: { ready: boolean; environment: string }; boleto: { ready: boolean } };
}

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

interface Boleto {
  id: string;
  issuerId: string | null;
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
  const [issuers, setIssuers] = useState<IssuerOption[]>([]);
  const [chosenIssuer, setChosenIssuer] = useState<string | null>(order.issuerId ?? order.customerDefaultIssuerId ?? null);
  /** Empresa da NF ativa (informada pela seção de nota). */
  const [invoiceIssuer, setInvoiceIssuer] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings/issuers');
        if (!res.ok) return;
        const d = (await res.json()) as { data?: IssuerOption[] };
        setIssuers(d.data ?? []);
      } catch {
        /* sem lista: o servidor usa a empresa do pedido/cliente/padrão */
      }
    })();
  }, []);

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

  const call = async (key: string, url: string, okMsg: string, body?: unknown) => {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
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
    const by = selectedIssuer ? `\n\nCNPJ: ${selectedIssuer.name} (${fmtCnpj(selectedIssuer.cnpj)})` : '';
    const ok = await confirm({
      title: 'Gerar boleto',
      message: `Registrar no Sicoob um boleto de ${brl(order.total)} com vencimento em ${br(order.dueDate)} para ${order.customerName ?? 'o cliente'}?${by}${warn}`,
      confirmLabel: 'Gerar boleto',
      cancelLabel: 'Voltar',
    });
    if (ok) {
      await call('issue', `/api/orders/${order.id}/boletos`, 'Boleto registrado no Sicoob.', {
        issuerId: selectedIssuer?.id ?? null,
      });
    }
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
      await saveResponseAsFile(res, `Boleto Pedido ${order.numero}.pdf`);
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

  const activeBoleto = boletos.find((b) => ['pendente_registro', 'registrado', 'pago'].includes(b.status));
  const hasActive = Boolean(activeBoleto);
  // Com NF ou boleto ativo, o CNPJ fica travado no do documento.
  const lockedIssuerId = activeBoleto?.issuerId ?? invoiceIssuer ?? null;
  const fallbackIssuer = issuers.find((i) => i.isDefault) ?? issuers[0] ?? null;
  const selectedIssuer =
    issuers.find((i) => i.id === (lockedIssuerId ?? chosenIssuer)) ?? (lockedIssuerId ? null : fallbackIssuer);
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
          {issuers.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-amber-800">Faturar por (CNPJ)</p>
                {lockedIssuerId && <span className="text-[10px] font-bold text-amber-700">travado: já tem nota ou boleto</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {issuers.map((i) => {
                  const active = selectedIssuer?.id === i.id;
                  const disabled = Boolean(lockedIssuerId) && !active;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      disabled={disabled || busy !== null}
                      onClick={() => setChosenIssuer(i.id)}
                      className={`text-left rounded-lg border px-3 py-2 text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        active ? 'border-amber-600 bg-white ring-2 ring-amber-500/30' : 'border-stone-200 bg-white/70 hover:border-amber-400'
                      }`}
                    >
                      <span className="block font-black text-stone-800">{i.name}</span>
                      <span className="block text-[10px] text-stone-500">{fmtCnpj(i.cnpj)}</span>
                      <span className="mt-1 flex gap-1.5 text-[9px] font-bold uppercase">
                        <span className={i.integrations.invoice.ready ? 'text-emerald-700' : 'text-stone-400'}>
                          NF {i.integrations.invoice.ready ? (i.integrations.invoice.environment === 'producao' ? '✓' : '✓ teste') : '—'}
                        </span>
                        <span className={i.integrations.boleto.ready ? 'text-emerald-700' : 'text-stone-400'}>
                          Boleto {i.integrations.boleto.ready ? '✓' : '—'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {order.docsLink && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-sky-800">Link do cliente</p>
                <p className="text-[11px] text-sky-700">Boleto, nota e espelho, sem login. Também vai no botão de WhatsApp.</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(order.docsLink!);
                    toast('Link copiado. É só colar na conversa com o cliente.', 'success');
                  } catch {
                    toast(order.docsLink!, 'info');
                  }
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold cursor-pointer"
              >
                <Copy className="h-4 w-4" /> Copiar link
              </button>
            </div>
          )}
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

          <InvoiceSection order={order} issuer={selectedIssuer} onActiveIssuer={setInvoiceIssuer} />
        </div>
      </div>
    </div>
  );
}

// ─── Nota fiscal ────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  issuerId: string | null;
  ref: string;
  number: number | null;
  series: number | null;
  accessKey: string | null;
  status: 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro' | 'descartada';
  rejectionReason: string | null;
  authorizedAt: string | null;
  canCancel: boolean;
  environment: string | null;
}

const NF_STATUS: Record<Invoice['status'], { label: string; cls: string }> = {
  processando: { label: 'Processando', cls: 'bg-sky-50 text-sky-700 border border-sky-100' },
  autorizada: { label: 'Autorizada', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  rejeitada: { label: 'Rejeitada', cls: 'bg-red-50 text-red-700 border border-red-100' },
  cancelada: { label: 'Cancelada', cls: 'bg-stone-100 text-stone-500' },
  erro: { label: 'Erro', cls: 'bg-red-50 text-red-700 border border-red-100' },
  descartada: { label: 'Descartada', cls: 'bg-stone-100 text-stone-400' },
};

function InvoiceSection({
  order,
  issuer,
  onActiveIssuer,
}: {
  order: BillingOrder;
  issuer: IssuerOption | null;
  onActiveIssuer: (issuerId: string | null) => void;
}) {
  const { toast } = useToast();
  const [notas, setNotas] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}/notas`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao carregar notas.'));
      const d = (await res.json()) as { data?: Invoice[]; defaultMessage?: string; orderNotes?: string | null };
      setNotas(d.data ?? []);
      const active = (d.data ?? []).find((n) => n.status === 'processando' || n.status === 'autorizada');
      onActiveIssuer(active?.issuerId ?? null);
      setDefaultMessage(d.defaultMessage ?? '');
      setOrderNotes(d.orderNotes ?? '');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar notas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [order.id, toast, onActiveIssuer]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (key: string, url: string, okMsg: string, body?: unknown) => {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro na operação.'));
      toast(okMsg, 'success');
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro na operação.', 'error');
      return false;
    } finally {
      setBusy(null);
      await load();
    }
  };

  const openIssue = () => {
    setMessage(defaultMessage);
    setNotes('');
    setIssueOpen(true);
  };

  const issue = async () => {
    const ok = await post('issue', `/api/orders/${order.id}/notas`, 'Nota enviada. Clique em "Atualizar status" em alguns segundos.', {
      message: message.trim() || null,
      notes: notes.trim() || null,
      issuerId: issuer?.id ?? null,
    });
    if (ok) setIssueOpen(false);
  };

  const open = async (n: Invoice, kind: 'danfe' | 'xml') => {
    setBusy(`${kind}-${n.id}`);
    try {
      const res = await fetch(`/api/notas/${n.id}/${kind}`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao baixar o documento.'));
      await saveResponseAsFile(res, `NF-e Pedido ${order.numero}.${kind === 'danfe' ? 'pdf' : 'xml'}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao baixar o documento.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const refreshIe = async () => {
    setBusy('ie');
    try {
      const res = await fetch(`/api/customers/${order.customerId}/atualizar-ie`, { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao consultar a IE.'));
      const d = (await res.json()) as { message?: string };
      toast(d.message ?? 'IE do cliente atualizada.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao consultar a IE.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const hasActive = notas.some((n) => n.status === 'processando' || n.status === 'autorizada');
  const ieProblem = notas.some((n) => /\bIE\b|inscri/i.test(n.rejectionReason ?? '') && (n.status === 'rejeitada' || n.status === 'erro'));
  const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 text-[11px] font-bold hover:bg-stone-50 disabled:opacity-50 cursor-pointer';

  return (
    <div className="border-t border-stone-100 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
            <Receipt className="h-3.5 w-3.5" /> Nota fiscal (NF-e)
          </p>
          <p className="text-[11px] text-stone-500">Confere cadastro e dados fiscais antes de enviar.</p>
          <button
            onClick={refreshIe}
            disabled={busy !== null}
            className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold underline-offset-2 hover:underline disabled:opacity-50 cursor-pointer ${ieProblem ? 'text-red-700' : 'text-stone-500'}`}
          >
            {busy === 'ie' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {ieProblem ? 'Problema de IE: atualizar IE do cliente pelo CNPJ' : 'Atualizar IE do cliente pelo CNPJ'}
          </button>
        </div>
        {!hasActive && !issueOpen && order.status !== 'cancelado' && (
          <button onClick={openIssue} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
            <Plus className="h-4 w-4" /> Emitir NF-e
          </button>
        )}
      </div>

      {issueOpen && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-2">
          <p className="text-[11px] text-stone-600">
            NF-e de <strong>{brl(order.total)}</strong> para <strong>{order.customerName ?? 'o cliente'}</strong> — pedido #{order.numero}
            {issuer && (
              <>
                {' '}· emitente <strong>{issuer.name}</strong> ({fmtCnpj(issuer.cnpj)})
              </>
            )}
          </p>
          <div>
            <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Mensagem na nota</label>
            <textarea
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-stone-200 text-xs bg-white"
              placeholder="Ex.: Obrigado pela preferência!"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Observação deste pedido (opcional)</label>
              {orderNotes && !notes && (
                <button type="button" onClick={() => setNotes(orderNotes)} className="text-[10px] font-bold text-amber-700 hover:underline cursor-pointer">
                  Usar observação do pedido
                </button>
              )}
            </div>
            <textarea
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-stone-200 text-xs bg-white"
              placeholder="Ex.: Entregar na cozinha, falar com o João."
            />
          </div>
          <p className="text-[10px] text-stone-400">Sai em &quot;Informações complementares&quot; da nota, depois do número do pedido.</p>
          <div className="flex justify-end gap-1.5">
            <button className={btn} onClick={() => setIssueOpen(false)} disabled={busy !== null}>Voltar</button>
            <button onClick={issue} disabled={busy !== null} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[11px] font-bold disabled:opacity-60 cursor-pointer">
              {busy === 'issue' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />} Emitir NF-e
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4 text-stone-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : notas.filter((n) => n.status !== 'descartada').length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-2">Nenhuma nota emitida para este pedido.</p>
      ) : (
        <ul className="space-y-3">
          {notas.filter((n) => n.status !== 'descartada').map((n) => (
            <li key={n.id} className="rounded-xl border border-stone-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-stone-600">
                  {n.number ? `NF-e nº ${n.number}${n.series ? ` série ${n.series}` : ''}` : n.ref}
                  {n.environment === 'homologacao' && <span className="ml-1 text-[9px] font-bold text-amber-700">(TESTE)</span>}
                </span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${NF_STATUS[n.status].cls}`}>{NF_STATUS[n.status].label}</span>
              </div>
              {n.accessKey && <p className="text-[10px] font-mono text-stone-500 break-all">Chave: {n.accessKey}</p>}
              {n.rejectionReason && <p className="text-[11px] text-red-700 bg-red-50 rounded p-2">{n.rejectionReason}</p>}
              <div className="flex flex-wrap gap-1.5">
                {(n.status === 'processando' || n.status === 'autorizada') && (
                  <button className={btn} disabled={busy !== null} onClick={() => post(`ref-${n.id}`, `/api/notas/${n.id}/atualizar`, 'Status atualizado.')}>
                    {busy === `ref-${n.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar status
                  </button>
                )}
                {(n.status === 'autorizada' || n.status === 'cancelada') && (
                  <>
                    <button className={btn} disabled={busy !== null} onClick={() => open(n, 'danfe')}>
                      {busy === `danfe-${n.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} DANFE
                    </button>
                    <button className={btn} disabled={busy !== null} onClick={() => open(n, 'xml')}>
                      {busy === `xml-${n.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode className="h-3.5 w-3.5" />} XML
                    </button>
                  </>
                )}
                {n.status === 'autorizada' && n.canCancel && cancelId !== n.id && (
                  <button className={`${btn} text-red-700`} disabled={busy !== null} onClick={() => { setCancelId(n.id); setReason(''); }}>
                    <Ban className="h-3.5 w-3.5" /> Cancelar NF
                  </button>
                )}
                {(n.status === 'erro' || n.status === 'rejeitada') && (
                  <button className={btn} disabled={busy !== null} onClick={() => post(`del-${n.id}`, `/api/notas/${n.id}/descartar`, 'Tentativa descartada.')}>
                    <X className="h-3.5 w-3.5" /> Descartar
                  </button>
                )}
              </div>
              {cancelId === n.id && (
                <div className="space-y-2 bg-red-50/50 rounded-lg p-2">
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motivo do cancelamento (mínimo 15 caracteres)"
                    className="w-full px-2 py-1.5 rounded border border-stone-200 text-xs"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button className={btn} onClick={() => setCancelId(null)}>Voltar</button>
                    <button
                      className={`${btn} text-red-700`}
                      disabled={busy !== null || reason.trim().length < 15}
                      onClick={async () => {
                        if (await post(`can-${n.id}`, `/api/notas/${n.id}/cancelar`, 'Cancelamento enviado. Atualize o status em instantes.', { reason: reason.trim() })) setCancelId(null);
                      }}
                    >
                      Confirmar cancelamento
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

