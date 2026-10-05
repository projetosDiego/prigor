/**
 * Regras de forma de pagamento usadas no servidor E nas telas.
 * Sem dependências: pode ser importado por componente cliente.
 */

/**
 * A forma de pagamento é guardada como texto no pedido ("Boleto 7 dias",
 * "Boleto 15 dias"…). Qualquer forma cujo nome contenha "boleto" (sem ligar
 * para caixa ou acento) conta como boleto.
 */
export function isBoletoPaymentMethod(paymentMethod: string | null | undefined): boolean {
  if (!paymentMethod) return false;
  return paymentMethod
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('boleto');
}
