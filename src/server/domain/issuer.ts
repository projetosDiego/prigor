/**
 * Regras puras de empresa emissora (CNPJ) do pedido.
 */

/** Pedido tem NF ou boleto ATIVO? Então o CNPJ dele não muda mais. */
export function hasActiveDocuments(order: {
  boletos: { status: string }[];
  invoices: { status: string }[];
}): boolean {
  return (
    order.boletos.some((b) => ['pendente_registro', 'registrado', 'pago'].includes(b.status)) ||
    order.invoices.some((i) => ['processando', 'autorizada'].includes(i.status))
  );
}
