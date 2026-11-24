/**
 * Clube Prigor — regras puras da fidelização do cliente final.
 *
 * O consumidor se cadastra pelo QR Code do balcão de um ponto de revenda e
 * ganha um cupom. Ele mesmo resgata o cupom no ponto (o revendedor só olha a
 * tela "ao vivo" e entrega o produto) e a quantidade vira bonificação a repor
 * ao revendedor no pedido seguinte.
 *
 * Sem Prisma, sem Next, sem HTTP: entra dado simples, sai dado simples.
 */
import { qty, type Decimal, type NumericInput } from './money';

/** Por quantos segundos a tela de cupom validado fica "ao vivo" depois do resgate. */
export const REDEEM_LIVE_SECONDS = 180;

/** Teto de resgates por ponto por dia — trava abuso com números inventados. */
export const POINT_DAILY_REDEEM_LIMIT = 20;

/** Cupom de boas-vindas dado no cadastro. */
export const WELCOME_REWARD = {
  kind: 'boas_vindas',
  title: 'Compre 1 brownie e leve 2',
  /** Brownies que o ponto entrega de graça e que repomos a ele. */
  bonusUnits: '1',
} as const;

/** Alfabeto do código do ponto: sem 0/O, 1/I/L, para ninguém errar ao digitar. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const POINT_CODE_LENGTH = 6;

/**
 * Normaliza um celular brasileiro: só dígitos, com DDD, sem o 55.
 * Aceita "(21) 98765-4321", "+55 21 98765 4321", "21987654321".
 * Devolve null se não for um celular válido (11 dígitos, DDD 11–99, começa com 9).
 */
export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (digits[2] !== '9') return null;
  return digits;
}

/** "21987654321" → "(21) 98765-4321". */
export function formatMobile(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Primeiro nome com inicial maiúscula — é o que aparece na tela de resgate. */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

/** Monta o código do ponto a partir de bytes aleatórios (gerados fora daqui). */
export function pointCodeFromBytes(bytes: Uint8Array, length = POINT_CODE_LENGTH): string {
  if (bytes.length < length) throw new Error('Bytes insuficientes para o código.');
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return code;
}

export function isValidPointCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${POINT_CODE_LENGTH}}$`).test(code);
}

export type RedeemRefusal = 'cupom_usado' | 'cupom_vencido' | 'outro_ponto' | 'limite_diario_ponto';

export interface RedeemCheckInput {
  status: string;
  redeemedTodayAtPoint: number;
  dailyLimit?: number;
  expiresAt?: Date | null;
  /** Brinde com estoque reservado num ponto específico. */
  reservedPointId?: string | null;
  pointId?: string;
  now?: Date;
}

/** Decide se o cupom pode ser resgatado agora neste ponto. */
export function checkRedeem(input: RedeemCheckInput): { ok: true } | { ok: false; reason: RedeemRefusal } {
  if (input.status !== 'disponivel') return { ok: false, reason: 'cupom_usado' };
  if (input.expiresAt && input.now && input.expiresAt.getTime() < input.now.getTime()) {
    return { ok: false, reason: 'cupom_vencido' };
  }
  if (input.reservedPointId && input.pointId && input.reservedPointId !== input.pointId) {
    return { ok: false, reason: 'outro_ponto' };
  }
  if (input.redeemedTodayAtPoint >= (input.dailyLimit ?? POINT_DAILY_REDEEM_LIMIT)) {
    return { ok: false, reason: 'limite_diario_ponto' };
  }
  return { ok: true };
}

export const REDEEM_REFUSAL_MESSAGE: Record<RedeemRefusal, string> = {
  cupom_usado: 'Este cupom já foi usado.',
  cupom_vencido: 'Este prêmio passou do prazo de retirada. Fale com a Prigor pelo WhatsApp.',
  outro_ponto: 'Este prêmio está reservado para o ponto onde você ganhou. Retire lá.',
  limite_diario_ponto: 'Este ponto atingiu o limite de resgates de hoje. Tente amanhã ou fale com a Prigor.',
};

// ─── Sorteio de prêmios ─────────────────────────────────────────────────────

export interface DrawCandidate {
  id: string;
  weight: number;
  /** false quando o brinde não tem mais unidade no ponto (ou não há ponto). */
  available: boolean;
}

/**
 * Sorteio ponderado. `random` em [0, 1) vem de fora (crypto no serviço, fixo no teste).
 * Prêmios sem estoque ou com peso 0 ficam fora; a chance dos demais é peso / soma.
 */
export function drawPrize(candidates: DrawCandidate[], random: number): string | null {
  const pool = candidates.filter((c) => c.available && c.weight > 0);
  const total = pool.reduce((acc, c) => acc + c.weight, 0);
  if (total <= 0) return null;
  let target = Math.min(Math.max(random, 0), 0.999999999) * total;
  for (const c of pool) {
    if (target < c.weight) return c.id;
    target -= c.weight;
  }
  return pool[pool.length - 1]!.id;
}

/** Chance de cada prêmio em %, para mostrar no painel. */
export function drawOdds(weights: { id: string; weight: number }[]): Map<string, number> {
  const total = weights.reduce((acc, w) => acc + Math.max(0, w.weight), 0);
  return new Map(weights.map((w) => [w.id, total > 0 ? (Math.max(0, w.weight) / total) * 100 : 0]));
}

/**
 * Unidades livres de um brinde num ponto: estoque − (já retirados + reservados ainda válidos).
 * null = sem limite.
 */
export function freeStock(stock: number | null, committed: number): number | null {
  if (stock === null) return null;
  return Math.max(0, stock - committed);
}

export function rewardExpiry(now: Date, validDays: number | null): Date | null {
  if (!validDays || validDays <= 0) return null;
  return new Date(now.getTime() + validDays * 86_400_000);
}

// ─── PIN ────────────────────────────────────────────────────────────────────

/** PIN de 4 dígitos, sem os óbvios (1111, 1234, 4321...). */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'O PIN deve ter 4 números.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Evite números repetidos (ex.: 1111).';
  const seq = '0123456789';
  const rev = '9876543210';
  if (seq.includes(pin) || rev.includes(pin)) return 'Evite sequências (ex.: 1234).';
  return null;
}

// ─── Pontos e tarefas ───────────────────────────────────────────────────────

/** Pontos que valem 1 brownie na troca (referência para o custo por ponto). */
export const POINTS_PER_BROWNIE = 100;

/** Teto de créditos por indicação no mês — trava "fábrica de amigos". */
export const MAX_REFERRAL_CREDITS_PER_MONTH = 10;

export function pointsBalance(deltas: number[]): number {
  return deltas.reduce((acc, d) => acc + d, 0);
}

export type TaskState =
  | { state: 'disponivel' }
  | { state: 'em_analise' }
  | { state: 'concluida' }
  | { state: 'aguarde'; nextAt: Date };

export interface TaskStateInput {
  /** null = só uma vez. */
  cooldownDays: number | null;
  /** Envios do cliente nesta tarefa (status + data). */
  submissions: { status: string; createdAt: Date }[];
  now: Date;
}

/** Situação da tarefa para o cliente. Recusados não contam. */
export function taskState(input: TaskStateInput): TaskState {
  const relevant = input.submissions.filter((s) => s.status === 'pendente' || s.status === 'aprovado');
  if (relevant.some((s) => s.status === 'pendente')) return { state: 'em_analise' };
  if (relevant.length === 0) return { state: 'disponivel' };
  if (input.cooldownDays === null) return { state: 'concluida' };
  const last = relevant.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  const nextAt = new Date(last.createdAt.getTime() + input.cooldownDays * 86_400_000);
  return nextAt.getTime() <= input.now.getTime() ? { state: 'disponivel' } : { state: 'aguarde', nextAt };
}

/** Início do mês corrente em São Paulo, em UTC. */
export function startOfMonthSaoPaulo(now: Date): Date {
  const offsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() - offsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + offsetMs);
}

/** Segundos que a tela de resgate ainda fica ao vivo (0 = encerrada). */
export function liveSecondsLeft(redeemedAt: Date | null, now: Date, window = REDEEM_LIVE_SECONDS): number {
  if (!redeemedAt) return 0;
  const elapsed = Math.floor((now.getTime() - redeemedAt.getTime()) / 1000);
  return Math.max(0, Math.min(window, window - elapsed));
}

/** Soma das unidades de bonificação (Decimal, 3 casas). */
export function sumBonusUnits(values: NumericInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(qty(v)), qty(0));
}

/**
 * Início do dia em São Paulo (UTC−3, sem horário de verão desde 2019), em UTC.
 * Usado para contar "resgates de hoje" no fuso do negócio, não no do servidor.
 */
export function startOfDaySaoPaulo(now: Date): Date {
  const offsetMs = 3 * 3600_000;
  const local = new Date(now.getTime() - offsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offsetMs);
}

/** Link do WhatsApp para falar com o cliente. */
export function whatsappLink(digits: string, text?: string): string {
  return `https://wa.me/55${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// ─── Código SMS ─────────────────────────────────────────────────────────────

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Espera mínima entre dois envios para o mesmo celular. */
export const OTP_RESEND_SECONDS = 60;
/** Máximo de envios por celular por hora. */
export const OTP_PER_PHONE_PER_HOUR = 3;

export type OtpProblem = 'nenhum_codigo' | 'expirado' | 'tentativas' | 'usado';

export interface OtpState {
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
}

/** O código ainda pode ser conferido? (a comparação do valor é feita fora). */
export function otpProblem(code: OtpState | null, now: Date): OtpProblem | null {
  if (!code) return 'nenhum_codigo';
  if (code.usedAt) return 'usado';
  if (code.attempts >= OTP_MAX_ATTEMPTS) return 'tentativas';
  if (code.expiresAt.getTime() < now.getTime()) return 'expirado';
  return null;
}

export const OTP_PROBLEM_MESSAGE: Record<OtpProblem, string> = {
  nenhum_codigo: 'Peça um código por SMS primeiro.',
  expirado: 'O código venceu. Peça um novo.',
  tentativas: 'Muitas tentativas com este código. Peça um novo.',
  usado: 'Este código já foi usado. Peça um novo.',
};

export interface OtpSendCheckInput {
  lastSentAt: Date | null;
  sentLastHour: number;
  sentToday: number;
  dailyLimit: number;
  now: Date;
}

export type OtpSendRefusal = { reason: 'aguarde'; seconds: number } | { reason: 'limite_celular' } | { reason: 'limite_diario' };

/** Pode mandar mais um SMS para este celular agora? */
export function checkOtpSend(input: OtpSendCheckInput): OtpSendRefusal | null {
  if (input.sentToday >= input.dailyLimit) return { reason: 'limite_diario' };
  if (input.lastSentAt) {
    const elapsed = Math.floor((input.now.getTime() - input.lastSentAt.getTime()) / 1000);
    if (elapsed < OTP_RESEND_SECONDS) return { reason: 'aguarde', seconds: OTP_RESEND_SECONDS - elapsed };
  }
  if (input.sentLastHour >= OTP_PER_PHONE_PER_HOUR) return { reason: 'limite_celular' };
  return null;
}

/** Texto do SMS: sem acento, para caber num único SMS barato (160 caracteres). */
export function otpSmsText(code: string, purpose: 'cadastro' | 'pin'): string {
  return purpose === 'pin'
    ? `Doces Prigor: seu codigo para criar um novo PIN do Clube e ${code}. Vale por ${OTP_TTL_MINUTES} minutos.`
    : `Doces Prigor: seu codigo do Clube Prigor e ${code}. Vale por ${OTP_TTL_MINUTES} minutos. Nao compartilhe.`;
}

/** "21987654321" → "(21) 9****-4321" para mostrar na tela sem expor o número. */
export function maskMobile(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits[2]}****-${digits.slice(7)}`;
}
