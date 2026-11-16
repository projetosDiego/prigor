import type { PricedLine } from '../natal/pricing';

/** Linha do pedido como fica gravada (JSON em ShopOrder.items). */
export type StoredLine = Pick<
  PricedLine,
  'sku' | 'name' | 'option' | 'channel' | 'quantity' | 'unitCents' | 'grossCents' | 'discountPct' | 'discountCents' | 'totalCents'
>;

export const ORDER_STATUS: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  SINAL_PAGO: 'Sinal pago',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

export const ERP_STATUS: Record<string, string> = {
  PENDENTE: 'Enviando',
  ENVIADO: 'No ERP',
  ERRO: 'Falhou — reenviar',
  DESLIGADO: 'ERP não configurado',
};
