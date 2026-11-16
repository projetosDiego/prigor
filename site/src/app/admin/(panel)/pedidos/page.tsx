import type { Metadata } from 'next';
import Link from 'next/link';
import { RefreshCw, ShoppingBag } from 'lucide-react';

import { Badge, PageTitle } from '@/components/admin/fields';
import { db } from '@/lib/db';
import { describeDate } from '@/lib/natal/dates';
import { brl } from '@/lib/natal/pricing';
import { ERP_STATUS, ORDER_STATUS } from '@/lib/orders/types';
import { resendPendingAction } from '../../order-actions';

export const metadata: Metadata = { title: 'Pedidos' };
export const dynamic = 'force-dynamic';

const statusTone = (s: string) => (s === 'PAGO' ? 'green' : s === 'SINAL_PAGO' ? 'blue' : s === 'CANCELADO' ? 'red' : 'amber');
const erpTone = (s: string) => (s === 'ENVIADO' ? 'green' : s === 'ERRO' ? 'red' : 'neutral');

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; enviados?: string; falhas?: string }> }) {
  const { status, q, enviados, falhas } = await searchParams;
  const term = q?.trim();
  const [orders, totals, pendingErp] = await Promise.all([
    db.shopOrder.findMany({
      where: {
        ...(status && status in ORDER_STATUS ? { status } : {}),
        ...(term ? { OR: [{ code: { contains: term.toUpperCase() } }, { name: { contains: term } }, { phone: { contains: term.replace(/\D/g, '') || term } }, { companyName: { contains: term } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.shopOrder.aggregate({ where: { status: { not: 'CANCELADO' } }, _sum: { totalCents: true }, _count: true }),
    db.shopOrder.count({ where: { erpStatus: { in: ['PENDENTE', 'ERRO', 'DESLIGADO'] }, status: { not: 'CANCELADO' } } }),
  ]);

  return (
    <>
      <PageTitle title="Pedidos do site" description="Pedidos do cardápio de Natal. O pagamento é conferido pela equipe (Pix/cartão); o pedido também vai para o ERP." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Pedidos ativos</p>
          <p className="mt-1 text-3xl font-bold text-cocoa">{totals._count}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Valor (sem cancelados)</p>
          <p className="mt-1 text-3xl font-bold text-cocoa">{brl(totals._sum.totalCents ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">Fora do ERP</p>
          <p className="mt-1 text-3xl font-bold text-cocoa">{pendingErp}</p>
          {pendingErp > 0 && (
            <form action={resendPendingAction} className="mt-2">
              <button className="inline-flex items-center gap-2 text-sm font-semibold text-bronze hover:underline">
                <RefreshCw size={14} /> Enviar agora
              </button>
            </form>
          )}
        </div>
      </div>

      {enviados !== undefined && (
        <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {enviados} pedido(s) enviado(s) ao ERP.{Number(falhas) > 0 ? ` ${falhas} falharam — veja o motivo no pedido.` : ''}
        </p>
      )}

      <form method="get" className="mb-5 flex flex-wrap gap-2">
        <input name="q" defaultValue={q ?? ''} placeholder="Código, nome, telefone ou empresa" className="field !min-h-11 max-w-sm" />
        <select name="status" defaultValue={status ?? ''} className="field !min-h-11 !w-auto">
          <option value="">Todas as situações</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn btn-outline !min-h-11 !px-5 !text-[0.7rem]">Filtrar</button>
      </form>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center">
          <ShoppingBag className="mx-auto text-bronze" size={28} />
          <p className="mt-3 font-semibold text-cocoa">Nenhum pedido ainda.</p>
          <p className="mt-1 text-sm text-muted">Os pedidos feitos em /natal2026 aparecem aqui.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs tracking-wider text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">ERP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-cream/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/pedidos/${o.id}`} className="font-bold text-cocoa hover:text-bronze">{o.code}</Link>
                    <p className="text-xs text-muted">{o.createdAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-cocoa">{o.customerType === 'PJ' ? o.companyName : o.name}</p>
                    <p className="text-xs text-muted">{o.fulfillment === 'ENTREGA' ? `Entrega · ${o.neighborhood}` : `Retirada · ${o.pickupPoint}`}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{describeDate(o.deliveryDate).long}</td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{brl(o.totalCents)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(o.status)}>{ORDER_STATUS[o.status] ?? o.status}</Badge>
                    <p className="mt-1 text-xs text-muted">{o.paymentMethod === 'PIX' ? 'Pix' : 'Cartão'} · {o.paymentPlan === 'TOTAL' ? 'total' : 'sinal'} {brl(o.amountDueCents)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={erpTone(o.erpStatus)}>{o.erpStatus === 'ENVIADO' ? `Nº ${o.erpOrderNumber}` : ERP_STATUS[o.erpStatus] ?? o.erpStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
