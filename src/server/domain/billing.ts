/**
 * Faturamento — regras puras de boleto.
 *
 * Decisão de negócio (05/10/2026): boleto e nota fiscal são caminhos
 * independentes e MANUAIS. Nada é emitido por mudança de status do pedido;
 * quem emite é a gerência, pedido a pedido. Vendedor só lança o pedido e só
 * pode escolher uma forma "Boleto…" para cliente liberado pela gerência.
 *
 * Sem Prisma, sem HTTP: entra dado simples, sai dado simples.
 */
import { isBoletoPaymentMethod } from '../../lib/payment-method';

import { money, type NumericInput } from './money';

// ─── Forma de pagamento ─────────────────────────────────────────────────────

// Mora em `src/lib` porque as telas usam a mesma regra para esconder as opções.
export { isBoletoPaymentMethod };

export type BoletoPaymentCheck =
  | { ok: true; override: boolean }
  | { ok: false; reason: string };

/**
 * Pode este usuário lançar o pedido com esta forma de pagamento para este cliente?
 *
 *  - forma que não é boleto → sempre pode;
 *  - cliente liberado → pode;
 *  - cliente NÃO liberado + vendedor → bloqueado;
 *  - cliente NÃO liberado + gerência → pode, marcado como `override`
 *    (a tela pede confirmação e o serviço registra em auditoria).
 */
export function checkBoletoPaymentMethod(input: {
  paymentMethod: string | null | undefined;
  boletoAllowed: boolean;
  isManagement: boolean;
}): BoletoPaymentCheck {
  if (!isBoletoPaymentMethod(input.paymentMethod)) return { ok: true, override: false };
  if (input.boletoAllowed) return { ok: true, override: false };
  if (input.isManagement) return { ok: true, override: true };
  return {
    ok: false,
    reason:
      'Este cliente não está liberado para pagar no boleto. Escolha outra forma de pagamento ou peça a liberação à gerência.',
  };
}

// ─── Identificadores (idempotência) ────────────────────────────────────────

/** Limite do campo `seuNumero` na API de Cobrança do Sicoob. */
export const SEU_NUMERO_MAX = 18;

/** `PRG-<numero do pedido>-<sequência>`. Reemissão do mesmo pedido = sequência nova. */
export function buildSeuNumero(orderNumber: number, sequence: number): string {
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) throw new Error('Número do pedido inválido.');
  if (!Number.isInteger(sequence) || sequence <= 0) throw new Error('Sequência inválida.');
  const value = `PRG-${orderNumber}-${sequence}`;
  if (value.length > SEU_NUMERO_MAX) throw new Error(`seuNumero excede ${SEU_NUMERO_MAX} caracteres.`);
  return value;
}

/** `NF-<numero do pedido>-<sequência>` — referência enviada ao provedor fiscal. */
export function buildInvoiceRef(orderNumber: number, sequence: number): string {
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) throw new Error('Número do pedido inválido.');
  if (!Number.isInteger(sequence) || sequence <= 0) throw new Error('Sequência inválida.');
  return `NF-${orderNumber}-${sequence}`;
}

/** Próxima sequência a partir das referências já usadas pelo pedido (`XXX-<n>-<seq>`). */
export function nextSequence(existingRefs: string[]): number {
  let max = 0;
  for (const ref of existingRefs) {
    const seq = Number(ref.split('-').pop());
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return max + 1;
}

// ─── Ciclo de vida do boleto ────────────────────────────────────────────────

export type BoletoStatus =
  | 'pendente_registro'
  | 'registrado'
  | 'pago'
  | 'baixado'
  | 'cancelado'
  | 'erro';

/** Status em que o boleto ainda "vale" — impede emitir outro para o mesmo pedido. */
export const ACTIVE_BOLETO_STATUSES: readonly BoletoStatus[] = ['pendente_registro', 'registrado', 'pago'];

const TRANSITIONS: Record<BoletoStatus, readonly BoletoStatus[]> = {
  pendente_registro: ['registrado', 'erro', 'cancelado'],
  registrado: ['pago', 'baixado'],
  erro: ['pendente_registro', 'cancelado'],
  pago: [], // pago é intocável — estorno é feito no financeiro, não no boleto
  baixado: [],
  cancelado: [],
};

export function canTransitionBoleto(from: BoletoStatus, to: BoletoStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type OrderStatusForBilling =
  | 'novo'
  | 'confirmado'
  | 'em_producao'
  | 'entregue'
  | 'faturado'
  | 'cancelado';

/**
 * Pode emitir boleto para este pedido agora? Retorna o motivo quando não pode.
 * A emissão em si (botão) chega na fase 2; a regra já fica testada aqui.
 */
export function boletoIssueBlocker(input: {
  orderStatus: OrderStatusForBilling;
  orderTotal: NumericInput;
  dueDate: string | null;
  today: string; // YYYY-MM-DD
  existingStatuses: BoletoStatus[];
}): string | null {
  if (input.orderStatus === 'cancelado') return 'Pedido cancelado não pode gerar boleto.';
  if (!money(input.orderTotal).gt(0)) return 'Pedido sem valor não pode gerar boleto.';
  if (!input.dueDate) return 'Defina a data de vencimento do pedido antes de gerar o boleto.';
  if (input.dueDate < input.today) return 'O vencimento já passou. Ajuste a data antes de gerar o boleto.';
  const active = input.existingStatuses.find((s) => ACTIVE_BOLETO_STATUSES.includes(s));
  if (active === 'pago') return 'Este pedido já tem boleto pago.';
  if (active) return 'Este pedido já tem um boleto em aberto. Dê baixa nele antes de gerar outro.';
  return null;
}

// ─── Pagador do boleto ──────────────────────────────────────────────────────

export interface BoletoPayerData {
  tradeName: string;
  legalName: string | null;
  cnpj: string | null;
  cpf: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/** O que falta no cadastro do cliente para registrar o boleto. Vazio = pode emitir. */
export function boletoPayerProblems(c: BoletoPayerData): string[] {
  const problems: string[] = [];
  const digits = (v: string | null) => (v ?? '').replace(/\D/g, '');
  if (digits(c.cnpj).length !== 14 && digits(c.cpf).length !== 11) problems.push('CNPJ ou CPF do cliente');
  if (!c.address?.trim()) problems.push('endereço do cliente');
  if (!c.neighborhood?.trim()) problems.push('bairro do cliente');
  if (!c.city?.trim()) problems.push('cidade do cliente');
  if ((c.state ?? '').trim().length !== 2) problems.push('UF do cliente');
  if (digits(c.zipCode).length !== 8) problems.push('CEP do cliente');
  return problems;
}

/** Documento do pagador: CNPJ tem preferência sobre CPF. */
export function payerDocument(c: Pick<BoletoPayerData, 'cnpj' | 'cpf'>): string {
  const cnpj = (c.cnpj ?? '').replace(/\D/g, '');
  return cnpj.length === 14 ? cnpj : (c.cpf ?? '').replace(/\D/g, '');
}
