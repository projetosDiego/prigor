import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { Badge, PageTitle } from '@/components/admin/fields';
import { SubmitButton } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatCep, formatCnpj, formatCpf, formatPhone } from '@/lib/documents';
import { describeDate } from '@/lib/natal/dates';
import { brl } from '@/lib/natal/pricing';
import { orderPath } from '@/lib/orders/token';
import { ERP_STATUS, ORDER_STATUS, type StoredLine } from '@/lib/orders/types';
import { waLink } from '@/lib/whatsapp';
import { resendOrderAction, updateOrderAction } from '../../../order-actions';

export const metadata: Metadata = { title: 'Pedido' };
export const dynamic = 'force-dynamic';

export default async function OrderAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string; erp?: string }> }) {
  const [{ id }, { salvo, erp }] = await Promise.all([params, searchParams]);
  const o = await db.shopOrder.findUnique({ where: { id } });
  if (!o) notFound();
  const lines = JSON.parse(o.items) as StoredLine[];
  const firstName = o.name.split(' ')[0];
  const plan = o.paymentPlan === 'TOTAL' ? 'valor total' : 'sinal';
  const waConfirm = waLink(
    o.phone,
    `Olá, ${firstName}! Aqui é da Doces Prigor. Recebemos o seu pedido ${o.code} (${brl(o.totalCents)}) para ${describeDate(o.deliveryDate).long}. ` +
      (o.status === 'AGUARDANDO_PAGAMENTO'
        ? `Para confirmar, falta o pagamento do ${plan}: ${brl(o.amountDueCents)}.`
        : 'Pagamento confirmado — obrigado!'),
  );

  const rows: [string, React.ReactNode][] = [
    ['Cliente', o.customerType === 'PJ' ? `${o.companyName} · ${o.name}` : o.name],
    ['Documento', o.customerType === 'PJ' ? `CNPJ ${formatCnpj(o.document)}` : `CPF ${formatCpf(o.document)}`],
    ['Telefone', formatPhone(o.phone)],
    ['E-mail', o.email || '—'],
    [o.fulfillment === 'ENTREGA' ? 'Entrega' : 'Retirada', describeDate(o.deliveryDate).long],
    [
      'Endereço',
      o.fulfillment === 'ENTREGA'
        ? `${o.street}, ${o.number}${o.complement ? ` – ${o.complement}` : ''} · ${o.neighborhood} · ${o.city}/${o.state} · CEP ${formatCep(o.zipCode)}`
        : `Retirada em ${o.pickupPoint}`,
    ],
    ['Pagamento', `${o.paymentMethod === 'PIX' ? 'Pix' : 'Cartão de crédito'} · ${plan}: ${brl(o.amountDueCents)}${o.paymentPlan !== 'TOTAL' ? ` · restante ${brl(o.totalCents - o.amountDueCents)}` : ''}`],
    ['Observações do cliente', o.notes || '—'],
    ['Recebido em', o.createdAt.toLocaleString('pt-BR')],
    ['Origem', o.utmSource || 'site'],
  ];

  return (
    <>
      <Link href="/admin/pedidos" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-cocoa">
        <ArrowLeft size={15} /> Pedidos
      </Link>
      <PageTitle title={`Pedido ${o.code}`} description={`${brl(o.totalCents)} · ${ORDER_STATUS[o.status] ?? o.status}`}>
        <a href={waConfirm} target="_blank" rel="noopener" className="btn btn-whatsapp !min-h-10 !px-4 !text-[0.7rem]">
          <WhatsAppIcon size={16} /> Falar com o cliente
        </a>
      </PageTitle>
      {salvo && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Pedido atualizado.</p>}
      {erp && o.erpStatus === 'ENVIADO' && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">Enviado ao ERP: pedido nº {o.erpOrderNumber}.</p>}
      {erp && o.erpStatus !== 'ENVIADO' && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Não foi para o ERP: {o.erpError || ERP_STATUS[o.erpStatus]}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-6">
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="font-bold text-cocoa">Itens</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {lines.map((l) => (
                  <tr key={`${l.sku}|${l.option}`}>
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{l.quantity}×</span> {l.name}
                      {l.option && <span className="text-muted"> · {l.option}</span>}
                      {l.discountPct > 0 && <span className="ml-2 text-xs text-emerald-700">−{l.discountPct}%</span>}
                      <p className="text-xs text-muted">{l.sku} · {brl(l.unitCents)} un.</p>
                    </td>
                    <td className="py-2.5 text-right font-semibold whitespace-nowrap">{brl(l.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line">
                {o.discountCents > 0 && (
                  <tr><td className="pt-3 text-muted">Desconto</td><td className="pt-3 text-right text-emerald-700">− {brl(o.discountCents)}</td></tr>
                )}
                <tr><td className="pt-2 font-bold">Total (sem frete)</td><td className="pt-2 text-right font-bold">{brl(o.totalCents)}</td></tr>
              </tfoot>
            </table>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6">
            <dl className="grid gap-3 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid gap-1 sm:grid-cols-[11rem_1fr]">
                  <dt className="font-semibold text-muted">{k}</dt>
                  <dd className="text-cocoa">{v}</dd>
                </div>
              ))}
            </dl>
            <a href={orderPath(o.code)} target="_blank" rel="noopener" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-bronze hover:underline">
              Página do pedido (a mesma que o cliente vê) <ExternalLink size={14} />
            </a>
          </section>
        </div>

        <div className="grid gap-6">
          <form action={updateOrderAction} className="grid gap-4 rounded-2xl border border-line bg-white p-6">
            <input type="hidden" name="id" value={o.id} />
            <div>
              <label htmlFor="f-status" className="label">Situação do pagamento</label>
              <select id="f-status" name="status" defaultValue={o.status} className="field">
                {Object.entries(ORDER_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-adminNotes" className="label">Anotações internas</label>
              <textarea id="f-adminNotes" name="adminNotes" defaultValue={o.adminNotes} rows={4} className="field" placeholder="Taxa de entrega combinada, comprovante, etc." />
            </div>
            <SubmitButton>Salvar</SubmitButton>
            <p className="text-xs text-muted">A baixa do pagamento no financeiro é feita no ERP.</p>
          </form>

          <section className="grid gap-3 rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-cocoa">ERP</h2>
              <Badge tone={o.erpStatus === 'ENVIADO' ? 'green' : o.erpStatus === 'ERRO' ? 'red' : 'neutral'}>{ERP_STATUS[o.erpStatus] ?? o.erpStatus}</Badge>
            </div>
            {o.erpStatus === 'ENVIADO' ? (
              <p className="text-sm text-cocoa">Pedido nº <strong>{o.erpOrderNumber}</strong> no Doces Prigor OS{o.erpSentAt ? `, enviado em ${o.erpSentAt.toLocaleString('pt-BR')}` : ''}.</p>
            ) : (
              <>
                {o.erpError && <p className="text-sm text-red-800">{o.erpError}</p>}
                <p className="text-xs text-muted">Tentativas: {o.erpAttempts}. {o.erpStatus === 'DESLIGADO' ? 'Configure o endereço do ERP em Configurações.' : ''}</p>
                <form action={resendOrderAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <button className="btn btn-outline !min-h-10 !px-4 !text-[0.66rem]">
                    <RefreshCw size={14} /> Enviar ao ERP
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
