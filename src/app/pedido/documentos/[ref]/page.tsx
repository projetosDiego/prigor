/**
 * Documentos do pedido para o cliente — link secreto enviado pelo WhatsApp.
 * Sem login: o link (id do pedido + assinatura) é a autorização.
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CheckCircle2, FileCode, FileText, Landmark, Receipt } from 'lucide-react';

import { orderDocsRef, publicOrderDocuments } from '@/server/services/order-docs';

import CopyButton from './CopyButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Documentos do pedido | Doces Prigor',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ ref: string }> };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export default async function DocumentosPage({ params }: Props) {
  const { ref } = await params;
  const doc = await publicOrderDocuments(ref);
  if (!doc) notFound();

  const base = `/api/public/documentos/${encodeURIComponent(orderDocsRef(doc.orderId))}`;
  const btn =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all w-full sm:w-auto';

  return (
    <div className="min-h-screen bg-stone-100 py-8 px-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <Image src="/logo.png" alt="Doces Prigor" width={72} height={72} priority />
          <h1 className="text-lg font-black text-stone-800">Pedido nº {doc.numero}</h1>
          <p className="text-sm text-stone-600">{doc.customerName}</p>
          <p className="text-xs text-stone-500">
            {br(doc.orderDate)} · {brl(doc.total)} · {doc.paymentMethod}
          </p>
          {doc.cancelled && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Pedido cancelado</span>
          )}
        </div>

        {/* Boleto */}
        <section className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700">
            <Landmark className="h-4 w-4" /> Boleto
          </h2>
          {doc.boletos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum boleto emitido para este pedido.</p>
          ) : (
            doc.boletos.map((b) => (
              <div key={b.id} className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-stone-800">{brl(b.value)}</span>
                  {b.paid ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Pago
                    </span>
                  ) : (
                    <span className="text-stone-600">vence {br(b.dueDate)}</span>
                  )}
                </div>
                {!b.paid && b.linhaDigitavel && (
                  <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase text-stone-500">Linha digitável</p>
                    <p className="break-all font-mono text-xs text-stone-800">{b.linhaDigitavel}</p>
                    <CopyButton text={b.linhaDigitavel} />
                  </div>
                )}
                <a href={`${base}/boleto/${b.id}`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-amber-700 text-white hover:bg-amber-800`}>
                  <FileText className="h-4 w-4" /> Baixar boleto (PDF)
                </a>
              </div>
            ))
          )}
        </section>

        {/* Nota fiscal */}
        <section className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-700">
            <Receipt className="h-4 w-4" /> Nota fiscal
          </h2>
          {doc.invoices.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma nota fiscal emitida para este pedido.</p>
          ) : (
            doc.invoices.map((i) => (
              <div key={i.id} className="space-y-3">
                <p className="text-sm text-stone-700">
                  <span className="font-bold">NF-e nº {i.number ?? '—'}</span>
                  {i.series != null && <> · série {i.series}</>} · emitida em {br(i.authorizedAt)}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a href={`${base}/nf/${i.id}/danfe`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}>
                    <FileText className="h-4 w-4" /> Baixar nota (PDF)
                  </a>
                  <a href={`${base}/nf/${i.id}/xml`} className={`${btn} bg-white text-stone-700 border border-stone-300 hover:bg-stone-50`}>
                    <FileCode className="h-4 w-4" /> XML
                  </a>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Espelho */}
        {doc.orderPdf && (
          <section className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stone-600">
              <FileText className="h-4 w-4" /> Pedido
            </h2>
            <a href={`/api/public/orders/${doc.orderId}/pdf`} target="_blank" rel="noopener noreferrer" className={`${btn} bg-white text-stone-700 border border-stone-300 hover:bg-stone-50`}>
              <FileText className="h-4 w-4" /> Baixar espelho do pedido
            </a>
          </section>
        )}

        <p className="text-center text-[11px] text-stone-400">
          Este link é pessoal do seu pedido. Doces Prigor agradece a preferência!
        </p>
      </div>
    </div>
  );
}
