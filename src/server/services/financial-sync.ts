/**
 * Sincronização entre pedido e financeiro.
 *
 * No sistema anterior o lançamento era criado uma vez e **nunca mais
 * atualizado**: alterar itens, desconto ou frete de um pedido já confirmado
 * recalculava o total do pedido e deixava a conta a receber com o valor
 * antigo, sem aviso. Aqui a regra é explícita:
 *
 *  - lançamento pendente acompanha o pedido (valor, vencimento, descrição);
 *  - lançamento já pago é intocável: se o pedido mudar de valor, a operação é
 *    recusada com uma mensagem dizendo para estornar a baixa primeiro;
 *  - se o pedido sai do status que gera o lançamento, o pendente é removido.
 */
import { dec } from '../domain/money';
import { generatesCommissionPayable, generatesReceivable, type OrderStatus } from '../domain/orders';
import { conflict } from '../http/errors';

export const CATEGORY_SALES = 'Vendas';
export const CATEGORY_COMMISSION = 'Comissões de Vendas';

interface TxClient {
  financialTransaction: {
    findFirst(args: unknown): Promise<TransactionRecord | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
  };
}

interface TransactionRecord {
  id: string;
  status: string;
  value: unknown;
}

export interface OrderForFinance {
  id: string;
  numero: number;
  status: OrderStatus;
  total: string;
  commissionVal: string;
  orderDate: Date;
  dueDate: Date | null;
  sellerId: string | null;
  customerName: string;
  sellerName: string | null;
}

async function reconcile(
  tx: TxClient,
  params: {
    orderId: string;
    type: 'receita' | 'despesa';
    category: string;
    shouldExist: boolean;
    value: string;
    description: string;
    issueDate: Date;
    dueDate: Date;
    conflictLabel: string;
  },
): Promise<void> {
  const existing = await tx.financialTransaction.findFirst({
    where: { orderId: params.orderId, type: params.type, category: params.category },
  });

  if (!params.shouldExist) {
    if (!existing) return;
    if (existing.status === 'pago') {
      throw conflict(
        `${params.conflictLabel} deste pedido já foi baixado no financeiro. ` +
          'Estorne a baixa antes de alterar ou cancelar o pedido.',
      );
    }
    await tx.financialTransaction.delete({ where: { id: existing.id } });
    return;
  }

  if (!existing) {
    await tx.financialTransaction.create({
      data: {
        type: params.type,
        description: params.description,
        category: params.category,
        value: params.value,
        issueDate: params.issueDate,
        dueDate: params.dueDate,
        status: 'pendente',
        orderId: params.orderId,
      },
    });
    return;
  }

  const sameValue = dec(String(existing.value)).equals(dec(params.value));

  if (existing.status === 'pago') {
    if (sameValue) return;
    throw conflict(
      `${params.conflictLabel} deste pedido já foi baixado por um valor diferente. ` +
        'Estorne a baixa antes de alterar o pedido.',
    );
  }

  await tx.financialTransaction.update({
    where: { id: existing.id },
    data: {
      value: params.value,
      description: params.description,
      issueDate: params.issueDate,
      dueDate: params.dueDate,
    },
  });
}

/**
 * Deixa o financeiro coerente com o estado atual do pedido.
 * Idempotente: rodar duas vezes não duplica nada.
 */
export async function syncOrderFinancials(tx: TxClient, order: OrderForFinance): Promise<void> {
  const dueDate = order.dueDate ?? order.orderDate;
  const hasTotal = dec(order.total).greaterThan(0);
  const hasCommission = dec(order.commissionVal).greaterThan(0);

  await reconcile(tx, {
    orderId: order.id,
    type: 'receita',
    category: CATEGORY_SALES,
    shouldExist: generatesReceivable(order.status) && hasTotal,
    value: order.total,
    description: `Pedido #${order.numero} — ${order.customerName}`,
    issueDate: order.orderDate,
    dueDate,
    conflictLabel: 'A conta a receber',
  });

  await reconcile(tx, {
    orderId: order.id,
    type: 'despesa',
    category: CATEGORY_COMMISSION,
    shouldExist:
      generatesCommissionPayable(order.status) && Boolean(order.sellerId) && hasCommission,
    value: order.commissionVal,
    description: `Comissão do pedido #${order.numero} — ${order.sellerName ?? 'vendedor'}`,
    issueDate: order.orderDate,
    dueDate,
    conflictLabel: 'A comissão',
  });
}
