import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { CalendarCheck, CheckCircle2, CreditCard, MapPin, Truck } from 'lucide-react';

import { WhatsAppIcon } from '@/components/icons';
import { CopyButton } from '@/components/natal/CopyButton';
import { db } from '@/lib/db';
import { formatCep, formatCnpj, formatCpf, formatPhone } from '@/lib/documents';
import { getNatalSettings } from '@/lib/natal/config';
import { describeDate } from '@/lib/natal/dates';
import { brl } from '@/lib/natal/pricing';
import { checkOrderToken } from '@/lib/orders/token';
import { ORDER_STATUS, type StoredLine } from '@/lib/orders/types';
import { buildPixPayload } from '@/lib/pix';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedido recebido', robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  if (!/^NAT-\d{4,}$/.test(code) || !checkOrderToken(code, t)) notFound();
  const order = await db.shopOrder.findUnique({ where: { code } });
  if (!order) notFound();

  const [natal, settings] = await Promise.all([getNatalSettings(), getSettings()]);
  const lines = JSON.parse(order.items) as StoredLine[];
  const isPix = order.paymentMethod === 'PIX';
  const awaiting = order.status === 'AGUARDANDO_PAGAMENTO';
  const pixPayload =
    isPix && awaiting && natal.pix.key
      ? buildPixPayload({ key: natal.pix.key, name: natal.pix.name, city: natal.pix.city, amountCents: order.amountDueCents, txid: order.code })
      : '';
  const qrSvg = pixPayload ? await QRCode.toString(pixPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#24130f', light: '#ffffff' } }) : '';
  const dueLabel = order.paymentPlan === 'TOTAL' ? 'valor total' : `sinal de ${Math.round((order.amountDueCents / Math.max(1, order.totalCents)) * 100)}%`;
  const firstName = order.name.split(' ')[0];

  const waMessage =
    isPix && natal.pix.key
      ? `Olá! Fiz o pedido ${order.code} no site (${brl(order.amountDueCents)} de ${dueLabel}). Segue o comprovante do Pix.`
      : isPix
        ? `Olá! Fiz o pedido ${order.code} no site. Pode me enviar a chave Pix para o pagamento de ${brl(order.amountDueCents)} (${dueLabel})?`
        : `Olá! Fiz o pedido ${order.code} no site. Pode me enviar o link para pagar ${brl(order.amountDueCents)} (${dueLabel}) no cartão?`;
  const wa = waLink(settings.contact.whatsapp, waMessage);
  const date = describeDate(order.deliveryDate);

  return (
    <div className="natal-paper pb-16">
      <section className="container-x pt-12 text-center md:pt-20">
        <CheckCircle2 size={52} strokeWidth={1.3} className="mx-auto text-pine" />
        <p className="eyebrow eyebrow-plain mt-6 !text-berry">Pedido {order.code}</p>
        <h1 className="display-lg mx-auto mt-4 max-w-3xl text-cocoa">Recebemos o seu pedido, {firstName}!</h1>
        <p className="lead mx-auto mt-5 max-w-2xl">
          {awaiting
            ? `Para confirmar, pague o ${dueLabel}: ${brl(order.amountDueCents)}. Assim que o pagamento cair, a gente confirma pelo WhatsApp.`
            : `Situação: ${ORDER_STATUS[order.status] ?? order.status}.`}
        </p>
      </section>

      <div className="container-x mt-12 grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Pagamento */}
        <section className="rounded-[1.6rem] bg-white p-6 shadow-[0_30px_60px_-45px_rgb(36_19_15_/_0.45)] md:p-8" aria-labelledby="pagamento-title">
          <h2 id="pagamento-title" className="font-display text-2xl text-cocoa">
            Pagamento
          </h2>
          <p className="mt-2 text-muted">
            {brl(order.amountDueCents)} · {dueLabel}
            {order.paymentPlan !== 'TOTAL' && ` · restante ${brl(order.totalCents - order.amountDueCents)} na entrega`}
          </p>

          {awaiting && pixPayload ? (
            <div className="mt-6 grid gap-6 sm:grid-cols-[13rem_1fr] sm:items-start">
              <div className="mx-auto w-52 rounded-2xl border border-line p-3 sm:mx-0" role="img" aria-label="QR Code do Pix" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="grid gap-3">
                <p className="text-[0.92rem] text-cocoa">
                  Abra o app do seu banco, escolha <strong>Pix → Copia e cola</strong> (ou leia o QR Code) e confira o valor de <strong>{brl(order.amountDueCents)}</strong>.
                </p>
                <textarea readOnly value={pixPayload} className="field min-h-24 font-mono text-[0.72rem] break-all" aria-label="Código Pix copia e cola" />
                <CopyButton text={pixPayload} />
              </div>
            </div>
          ) : awaiting ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-cream-2 p-5 text-cocoa">
              <CreditCard size={20} className="mt-0.5 shrink-0 text-berry" />
              <p>
                {isPix
                  ? 'Vamos enviar a chave Pix pelo WhatsApp em instantes. Se preferir, chame a gente agora pelo botão abaixo.'
                  : 'Vamos enviar o link de pagamento com cartão pelo WhatsApp em instantes. Se preferir, chame a gente agora pelo botão abaixo.'}
              </p>
            </div>
          ) : null}

          <a href={wa} target="_blank" rel="noopener" className="btn btn-whatsapp mt-6 w-full" data-track="whatsapp_click" data-track-label="natal:pedido">
            <WhatsAppIcon size={18} /> {isPix && natal.pix.key ? 'Enviar comprovante no WhatsApp' : 'Falar no WhatsApp'}
          </a>
          <p className="mt-4 text-[0.82rem] text-muted">Guarde esta página: o link dela mostra o seu pedido sempre que precisar.</p>
        </section>

        {/* Resumo */}
        <section className="rounded-[1.6rem] bg-cocoa p-6 text-cream md:p-8" aria-labelledby="resumo-title">
          <h2 id="resumo-title" className="font-display text-2xl">
            Resumo do pedido
          </h2>
          <ul className="mt-5 divide-y divide-cream/10">
            {lines.map((l) => (
              <li key={`${l.sku}|${l.option}`} className="flex justify-between gap-4 py-3 text-[0.95rem]">
                <span>
                  {l.quantity}× {l.name}
                  {l.option && <span className="block text-[0.85rem] text-cream/65">{l.option}</span>}
                  {l.discountPct > 0 && <span className="block text-[0.85rem] text-gold-2">−{l.discountPct}% por quantidade</span>}
                </span>
                <span className="font-semibold whitespace-nowrap">{brl(l.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-1.5 border-t border-cream/15 pt-4">
            {order.discountCents > 0 && (
              <div className="flex justify-between text-gold-2">
                <dt>Desconto</dt>
                <dd>− {brl(order.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold">
              <dt>Total</dt>
              <dd>{brl(order.totalCents)}</dd>
            </div>
            {order.fulfillment === 'ENTREGA' && <p className="text-[0.82rem] text-cream/60">+ taxa de entrega, combinada pelo WhatsApp.</p>}
          </dl>

          <div className="mt-6 grid gap-4 border-t border-cream/15 pt-6 text-[0.92rem]">
            <p className="flex items-start gap-3">
              <CalendarCheck size={18} className="mt-0.5 shrink-0 text-gold-2" />
              <span>
                {order.fulfillment === 'ENTREGA' ? 'Entrega' : 'Retirada'} em <strong>{date.long}</strong>
              </span>
            </p>
            <p className="flex items-start gap-3">
              {order.fulfillment === 'ENTREGA' ? <Truck size={18} className="mt-0.5 shrink-0 text-gold-2" /> : <MapPin size={18} className="mt-0.5 shrink-0 text-gold-2" />}
              <span>
                {order.fulfillment === 'ENTREGA'
                  ? `${order.street}, ${order.number}${order.complement ? ` – ${order.complement}` : ''} · ${order.neighborhood}, ${order.city}/${order.state} · CEP ${formatCep(order.zipCode)}`
                  : `Retirada: ${order.pickupPoint}`}
              </span>
            </p>
            <p className="text-cream/70">
              {order.customerType === 'PJ' ? `${order.companyName} · CNPJ ${formatCnpj(order.document)}` : `CPF ${formatCpf(order.document)}`} · {formatPhone(order.phone)}
            </p>
          </div>
        </section>
      </div>

      <p className="container-x mt-12 text-center">
        <Link href="/natal2026" className="link-arrow text-cocoa">
          Voltar ao cardápio de Natal
        </Link>
      </p>
    </div>
  );
}
