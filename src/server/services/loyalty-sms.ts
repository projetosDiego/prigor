/**
 * Clube Prigor — confirmação do celular por SMS (cadastro) e PIN recuperável por SMS.
 */
import { createHash, randomInt } from 'node:crypto';

import { prisma } from '../db';
import { AppError, badRequest, conflict, rateLimited } from '../http/errors';
import { isProd } from '../env';
import { logger } from '../http/logger';
import type { SessionPayload } from '../auth/guard';
import { sendSmsDev } from '../integrations/smsdev';
import {
  checkOtpSend,
  maskMobile,
  OTP_MAX_ATTEMPTS,
  OTP_PROBLEM_MESSAGE,
  OTP_TTL_MINUTES,
  otpProblem,
  otpSmsText,
  startOfDaySaoPaulo,
} from '../domain/loyalty';
import { audit } from './audit';

export type OtpPurpose = 'cadastro' | 'pin';

const hashCode = (id: string, code: string) => createHash('sha256').update(`${id}:${code}`).digest('hex');

async function settingsRow() {
  return prisma.loyaltySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
    select: { smsRequired: true, smsApiKey: true, smsDailyLimit: true },
  });
}

function apiKeyFrom(row: { smsApiKey: string | null }): { key: string | null; fromEnv: boolean } {
  const env = process.env.SMSDEV_API_KEY?.trim();
  if (env) return { key: env, fromEnv: true };
  return { key: row.smsApiKey?.trim() || null, fromEnv: false };
}

/** Sem chave fora de produção: modo teste (o código aparece na tela e no terminal). */
function testMode(key: string | null): boolean {
  return !key && !isProd;
}

/** O que as telas públicas precisam saber. */
export async function getPublicSmsConfig(): Promise<{ smsRequired: boolean; smsAvailable: boolean }> {
  const row = await settingsRow();
  const { key } = apiKeyFrom(row);
  const available = !!key || testMode(key);
  // Exigido continua exigido mesmo sem chave: o cadastro pausa, nunca passa sem confirmar.
  return { smsRequired: row.smsRequired, smsAvailable: available };
}

export interface RequestCodeResult {
  required: boolean;
  sentTo?: string;
  /** Só em teste local sem chave de SMS. */
  devCode?: string;
}

export async function requestPhoneCode(phone: string, purpose: OtpPurpose, ip: string | null): Promise<RequestCodeResult> {
  const row = await settingsRow();
  const { key } = apiKeyFrom(row);
  const available = !!key || testMode(key);

  const member = await prisma.loyaltyMember.findUnique({ where: { phone }, select: { id: true } });
  if (purpose === 'cadastro') {
    if (member) throw conflict('Este WhatsApp já está cadastrado no Clube Prigor. Entre com seu celular e PIN.');
    if (!row.smsRequired) return { required: false };
    if (!available) {
      logger.error('clube: confirmação por SMS exigida, mas sem chave da SMSDev');
      throw new AppError(503, 'INTERNAL', 'Cadastro indisponível no momento. Tente mais tarde ou fale com a Prigor.');
    }
  } else {
    if (!available) throw badRequest('A recuperação por SMS não está disponível. Fale com a Prigor pelo WhatsApp.');
    // Não revela se o número é cliente: responde igual, só não envia.
    if (!member) return { required: true, sentTo: maskMobile(phone) };
  }

  const now = new Date();
  const [last, sentLastHour, sentToday] = await Promise.all([
    prisma.loyaltyPhoneCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.loyaltyPhoneCode.count({ where: { phone, createdAt: { gte: new Date(now.getTime() - 3600_000) } } }),
    prisma.loyaltyPhoneCode.count({ where: { createdAt: { gte: startOfDaySaoPaulo(now) } } }),
  ]);
  const refusal = checkOtpSend({ lastSentAt: last?.createdAt ?? null, sentLastHour, sentToday, dailyLimit: row.smsDailyLimit, now });
  if (refusal?.reason === 'aguarde') throw rateLimited(`Aguarde ${refusal.seconds} segundos para pedir outro código.`);
  if (refusal?.reason === 'limite_celular') throw rateLimited('Muitos códigos pedidos para este celular. Tente de novo em 1 hora.');
  if (refusal?.reason === 'limite_diario') {
    logger.error('clube: limite diário de SMS atingido', { sentToday });
    throw new AppError(503, 'INTERNAL', 'Não conseguimos enviar o SMS agora. Tente mais tarde ou fale com a Prigor.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const created = await prisma.loyaltyPhoneCode.create({
    data: { phone, purpose, codeHash: 'pendente', expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000), ip },
    select: { id: true },
  });
  await prisma.loyaltyPhoneCode.update({ where: { id: created.id }, data: { codeHash: hashCode(created.id, code) }, select: { id: true } });

  if (testMode(key)) {
    logger.info('clube: código SMS (modo teste, sem chave da SMSDev)', { phone: maskMobile(phone), code });
    return { required: true, sentTo: maskMobile(phone), devCode: code };
  }

  const sent = await sendSmsDev(key!, phone, otpSmsText(code, purpose));
  if (!sent.ok) {
    // Não conta como envio: não queima o limite do cliente.
    await prisma.loyaltyPhoneCode.update({ where: { id: created.id }, data: { usedAt: now, attempts: OTP_MAX_ATTEMPTS }, select: { id: true } });
    // No PC (fora de produção) mostra o motivo da SMSDev para facilitar o teste.
    const detail = isProd ? '' : ` [SMSDev: ${sent.error}]`;
    throw new AppError(503, 'INTERNAL', `Não conseguimos enviar o SMS agora. Confira o número ou tente em instantes.${detail}`);
  }
  return { required: true, sentTo: maskMobile(phone) };
}

/**
 * Confere o código e o marca como usado. Erro conta tentativa (máx. 5).
 * Feito fora de transação de propósito: a tentativa errada precisa ficar gravada.
 */
export async function consumePhoneCode(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
  const row = await prisma.loyaltyPhoneCode.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true, attempts: true, expiresAt: true, usedAt: true },
  });
  const problem = otpProblem(row, new Date());
  if (problem) throw badRequest(OTP_PROBLEM_MESSAGE[problem]);

  if (row!.codeHash !== hashCode(row!.id, code.trim())) {
    await prisma.loyaltyPhoneCode.update({ where: { id: row!.id }, data: { attempts: { increment: 1 } }, select: { id: true } });
    const left = OTP_MAX_ATTEMPTS - row!.attempts - 1;
    throw badRequest(left > 0 ? `Código incorreto. Você ainda tem ${left} tentativa(s).` : OTP_PROBLEM_MESSAGE.tentativas);
  }
  const used = await prisma.loyaltyPhoneCode.updateMany({ where: { id: row!.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) throw badRequest(OTP_PROBLEM_MESSAGE.usado);
}

/** Exige o código no cadastro, quando a confirmação por SMS está ligada. */
export async function verifySignupPhone(phone: string, code: string | null | undefined): Promise<boolean> {
  const cfg = await getPublicSmsConfig();
  if (!cfg.smsRequired) return false;
  if (!code) throw badRequest('Digite o código que enviamos por SMS.');
  await consumePhoneCode(phone, 'cadastro', code);
  return true;
}

// ─── Gestão ─────────────────────────────────────────────────────────────────

export async function getSmsSettings() {
  const row = await settingsRow();
  const { key, fromEnv } = apiKeyFrom(row);
  const sentToday = await prisma.loyaltyPhoneCode.count({ where: { createdAt: { gte: startOfDaySaoPaulo(new Date()) } } });
  return {
    smsRequired: row.smsRequired,
    hasApiKey: !!key,
    apiKeyHint: key ? `••••${key.slice(-4)}` : null,
    fromEnv,
    smsDailyLimit: row.smsDailyLimit,
    sentToday,
    testMode: testMode(key),
  };
}

export async function saveSmsSettings(
  session: SessionPayload,
  input: { smsRequired: boolean; smsApiKey?: string | null; smsDailyLimit: number },
): Promise<void> {
  const row = await settingsRow();
  const nextKey = input.smsApiKey === undefined ? row.smsApiKey : input.smsApiKey?.trim() || null;
  const effective = process.env.SMSDEV_API_KEY?.trim() || nextKey;
  if (input.smsRequired && !effective && isProd) {
    throw badRequest('Cadastre a chave da SMSDev antes de exigir a confirmação por SMS.');
  }
  await prisma.loyaltySettings.update({
    where: { id: 'default' },
    data: { smsRequired: input.smsRequired, smsApiKey: nextKey, smsDailyLimit: input.smsDailyLimit },
    select: { id: true },
  });
  await audit(session, 'clube.config_sms', 'loyalty_settings', 'default', {
    smsRequired: input.smsRequired,
    smsDailyLimit: input.smsDailyLimit,
    apiKeyChanged: input.smsApiKey !== undefined,
  });
}

/** Manda um SMS de teste para conferir a chave e o saldo. */
export async function sendTestSms(session: SessionPayload, phone: string): Promise<{ ok: boolean; message: string }> {
  const row = await settingsRow();
  const { key } = apiKeyFrom(row);
  if (!key) return { ok: false, message: 'Nenhuma chave da SMSDev cadastrada.' };
  const r = await sendSmsDev(key, phone, 'Doces Prigor: teste do Clube Prigor. Se chegou, o SMS esta funcionando!');
  await audit(session, 'clube.sms_teste', 'loyalty_settings', 'default', { ok: r.ok });
  return r.ok ? { ok: true, message: `SMS enviado para ${maskMobile(phone)}.` } : { ok: false, message: `A SMSDev recusou: ${r.error}` };
}
