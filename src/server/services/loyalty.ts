/**
 * Clube Prigor — lado do cliente final (cadastro, login, cupons, tarefas, pontos).
 * As decisões ficam em src/server/domain/loyalty.ts; a gestão em loyalty-admin.ts.
 */
import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { prisma, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound, unauthorized } from '../http/errors';
import { newLoyaltyToken } from '../auth/loyalty-session';
import { consumePhoneCode, verifySignupPhone } from './loyalty-sms';
import {
  checkRedeem,
  drawPrize,
  firstName,
  formatMobile,
  freeStock,
  isValidPointCode,
  liveSecondsLeft,
  MAX_REFERRAL_CREDITS_PER_MONTH,
  pinProblem,
  pointCodeFromBytes,
  pointsBalance,
  REDEEM_REFUSAL_MESSAGE,
  rewardExpiry,
  startOfDaySaoPaulo,
  startOfMonthSaoPaulo,
  taskState,
  WELCOME_REWARD,
} from '../domain/loyalty';

type Tx = Prisma.TransactionClient;

const PIN_ROUNDS = 10;
const MAX_PROOF_BYTES = 1_500_000;
const PROOF_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ─── Pontos de revenda ──────────────────────────────────────────────────────

export interface LoyaltyPoint {
  id: string;
  name: string;
}

/** Ponto de revenda pelo código do QR do balcão (só pontos ativos no Clube). */
export async function findPointByCode(code: string): Promise<LoyaltyPoint | null> {
  const clean = code.trim().toLowerCase();
  if (!isValidPointCode(clean)) return null;
  const row = await prisma.customer.findFirst({
    where: { loyaltyCode: clean, active: true },
    select: { id: true, tradeName: true },
  });
  return row ? { id: row.id, name: row.tradeName } : null;
}

/** Trava por chave dentro da transação (evita dois sorteios levarem a última bolsa). */
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS ok`;
}

/** Quanto do estoque de cada brinde limitado já está comprometido num ponto. */
export async function committedStock(db: Tx | typeof prisma, pointId: string, prizeIds: string[], now: Date) {
  if (prizeIds.length === 0) return new Map<string, number>();
  const rows = await db.loyaltyReward.groupBy({
    by: ['prizeId'],
    where: {
      prizeId: { in: prizeIds },
      reservedPointId: pointId,
      OR: [{ status: 'usado' }, { status: 'disponivel', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.prizeId ?? '', r._count._all]));
}

/** Estoque configurado do brinde no ponto (ajuste do ponto ou padrão do prêmio). */
export async function configuredStock(db: Tx | typeof prisma, pointId: string, prizes: { id: string; stockPerPoint: number | null }[]) {
  const limited = prizes.filter((p) => p.stockPerPoint !== null);
  const overrides = limited.length
    ? await db.loyaltyPointStock.findMany({
        where: { customerId: pointId, prizeId: { in: limited.map((p) => p.id) } },
        select: { prizeId: true, quantity: true },
      })
    : [];
  const map = new Map(overrides.map((o) => [o.prizeId, o.quantity]));
  return new Map(limited.map((p) => [p.id, map.get(p.id) ?? p.stockPerPoint!]));
}

// ─── Visão do cliente ───────────────────────────────────────────────────────

export interface MemberRewardView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  source: string;
  requiresCheck: boolean;
  expiresAt: string | null;
  reservedPointName: string | null;
  redeemedAt: string | null;
  redeemPointName: string | null;
  liveSecondsLeft: number;
}

export interface MemberTaskView {
  id: string;
  code: string;
  title: string;
  description: string | null;
  points: number;
  actionUrl: string | null;
  actionLabel: string | null;
  proof: string;
  state: 'disponivel' | 'em_analise' | 'concluida' | 'aguarde';
  nextAt: string | null;
  lastRejectedNote: string | null;
}

export interface MemberView {
  firstName: string;
  phone: string;
  hasPin: boolean;
  points: number;
  referralCode: string | null;
  referralsCredited: number;
  rewards: MemberRewardView[];
  tasks: MemberTaskView[];
  catalog: { id: string; title: string; description: string | null; pointsCost: number }[];
  history: { delta: number; description: string; createdAt: string }[];
  serverNow: string;
}

/** O que o cliente vê na área dele. null = aparelho sem cadastro. */
export async function getMemberView(sessionHash: string | null, now = new Date()): Promise<MemberView | null> {
  if (!sessionHash) return null;
  const member = await prisma.loyaltyMember.findUnique({
    where: { sessionHash },
    select: {
      id: true,
      name: true,
      phone: true,
      pinHash: true,
      referralCode: true,
      rewards: {
        where: { status: { not: 'anulado' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          source: true,
          requiresCheck: true,
          expiresAt: true,
          redeemedAt: true,
          prize: { select: { description: true } },
          reservedPoint: { select: { tradeName: true } },
          redeemPoint: { select: { tradeName: true } },
        },
      },
      submissions: {
        orderBy: { createdAt: 'desc' },
        select: { taskId: true, status: true, createdAt: true, reviewNote: true },
      },
      points: { orderBy: { createdAt: 'desc' }, select: { delta: true, description: true, reason: true, createdAt: true } },
    },
  });
  if (!member) return null;

  const [tasks, catalog] = await Promise.all([
    prisma.loyaltyTask.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        points: true,
        actionUrl: true,
        actionLabel: true,
        proof: true,
        cooldownDays: true,
      },
    }),
    prisma.loyaltyPrize.findMany({
      where: { active: true, pointsCost: { not: null }, stockPerPoint: null },
      orderBy: [{ pointsCost: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, title: true, description: true, pointsCost: true },
    }),
  ]);

  const referralsCredited = member.points.filter((p) => p.reason === 'indicacao').length;

  return {
    firstName: firstName(member.name),
    phone: formatMobile(member.phone),
    hasPin: !!member.pinHash,
    points: pointsBalance(member.points.map((p) => p.delta)),
    referralCode: member.referralCode,
    referralsCredited,
    serverNow: now.toISOString(),
    rewards: member.rewards
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.prize?.description ?? null,
        status: r.status,
        source: r.source,
        requiresCheck: r.requiresCheck,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        reservedPointName: r.reservedPoint?.tradeName ?? null,
        redeemedAt: r.redeemedAt?.toISOString() ?? null,
        redeemPointName: r.redeemPoint?.tradeName ?? null,
        liveSecondsLeft: liveSecondsLeft(r.redeemedAt, now),
      }))
      // Disponíveis primeiro.
      .sort((a, b) => Number(b.status === 'disponivel') - Number(a.status === 'disponivel')),
    tasks: tasks.map((t) => {
      const subs = member.submissions.filter((s) => s.taskId === t.id);
      const st = t.proof === 'print' ? taskState({ cooldownDays: t.cooldownDays, submissions: subs, now }) : { state: 'disponivel' as const };
      const lastRejected = subs[0]?.status === 'recusado' ? subs[0].reviewNote ?? 'Não conseguimos confirmar. Tente de novo.' : null;
      return {
        id: t.id,
        code: t.code,
        title: t.title,
        description: t.description,
        points: t.points,
        actionUrl: t.actionUrl,
        actionLabel: t.actionLabel,
        proof: t.proof,
        state: st.state,
        nextAt: st.state === 'aguarde' ? st.nextAt.toISOString() : null,
        lastRejectedNote: lastRejected,
      };
    }),
    catalog: catalog.map((c) => ({ id: c.id, title: c.title, description: c.description, pointsCost: c.pointsCost! })),
    history: member.points.slice(0, 20).map((p) => ({
      delta: p.delta,
      description: p.description ?? p.reason,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

async function memberIdFromSession(sessionHash: string | null): Promise<string> {
  if (!sessionHash) throw unauthorized('Entre no Clube com seu celular e PIN.');
  const member = await prisma.loyaltyMember.findUnique({ where: { sessionHash }, select: { id: true } });
  if (!member) throw unauthorized('Entre no Clube com seu celular e PIN.');
  return member.id;
}

async function viewOrThrow(sessionHash: string, now = new Date()): Promise<MemberView> {
  const view = await getMemberView(sessionHash, now);
  if (!view) throw unauthorized();
  return view;
}

// ─── Cadastro com sorteio ───────────────────────────────────────────────────

export interface SignupInput {
  name: string;
  phone: string;
  neighborhood?: string | null;
  marketingConsent: boolean;
  pin: string;
  pointCode?: string | null;
  referralCode?: string | null;
  /** Código SMS, quando a confirmação por SMS está ligada. */
  smsCode?: string | null;
}

/** Sorteia o prêmio de boas-vindas dentro da transação, respeitando o estoque do ponto. */
async function drawWelcomePrize(tx: Tx, pointId: string | null, now: Date) {
  const prizes = await tx.loyaltyPrize.findMany({
    where: { active: true, drawWeight: { gt: 0 } },
    select: {
      id: true,
      code: true,
      title: true,
      bonusUnits: true,
      drawWeight: true,
      stockPerPoint: true,
      requiresCheck: true,
      validDays: true,
    },
  });
  if (prizes.length === 0) return null;

  let free = new Map<string, number | null>();
  if (pointId) {
    await lockKey(tx, `clube:estoque:${pointId}`);
    const stock = await configuredStock(tx, pointId, prizes);
    const used = await committedStock(tx, pointId, [...stock.keys()], now);
    free = new Map([...stock.entries()].map(([id, qty]) => [id, freeStock(qty, used.get(id) ?? 0)]));
  }

  const chosenId = drawPrize(
    prizes.map((p) => ({
      id: p.id,
      weight: p.drawWeight,
      // Brinde limitado só entra com ponto e com unidade livre.
      available: p.stockPerPoint === null || (pointId !== null && (free.get(p.id) ?? 0) > 0),
    })),
    randomInt(0, 1_000_000_000) / 1_000_000_000,
  );
  return prizes.find((p) => p.id === chosenId) ?? null;
}

/** Cadastra o cliente e sorteia o prêmio de boas-vindas. Devolve o token do cookie e o prêmio. */
export async function signupMember(input: SignupInput): Promise<{ token: string; prizeTitle: string }> {
  const pinIssue = pinProblem(input.pin);
  if (pinIssue) throw badRequest(pinIssue);
  const exists = await prisma.loyaltyMember.findUnique({ where: { phone: input.phone }, select: { id: true } });
  if (exists) throw conflict('Este WhatsApp já está cadastrado no Clube Prigor. Entre com seu celular e PIN.');
  const phoneVerified = await verifySignupPhone(input.phone, input.smsCode);

  const point = input.pointCode ? await findPointByCode(input.pointCode) : null;
  const referrer = input.referralCode
    ? await prisma.loyaltyMember.findUnique({ where: { referralCode: input.referralCode.trim().toLowerCase() }, select: { id: true } })
    : null;
  const pinHash = await bcrypt.hash(input.pin, PIN_ROUNDS);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { token, hash } = newLoyaltyToken();
    const now = new Date();
    try {
      const prizeTitle = await prisma.$transaction(async (tx) => {
        const prize = await drawWelcomePrize(tx, point?.id ?? null, now);
        const member = await tx.loyaltyMember.create({
          data: {
            name: input.name,
            phone: input.phone,
            neighborhood: input.neighborhood || null,
            marketingConsent: input.marketingConsent,
            consentAt: input.marketingConsent ? now : null,
            sessionHash: hash,
            pinHash,
            referralCode: pointCodeFromBytes(randomBytes(16)),
            referredById: referrer?.id ?? null,
            signupPointId: point?.id ?? null,
            phoneVerifiedAt: phoneVerified ? now : null,
          },
          select: { id: true },
        });
        const limited = prize?.stockPerPoint != null;
        await tx.loyaltyReward.create({
          data: {
            memberId: member.id,
            kind: prize?.code ?? WELCOME_REWARD.kind,
            title: prize?.title ?? WELCOME_REWARD.title,
            prizeId: prize?.id ?? null,
            source: 'boas_vindas',
            uniqueKey: `boas_vindas:${member.id}`,
            bonusUnits: prize?.bonusUnits ?? new Prisma.Decimal(WELCOME_REWARD.bonusUnits),
            requiresCheck: prize?.requiresCheck ?? false,
            reservedPointId: limited ? point!.id : null,
            expiresAt: rewardExpiry(now, prize?.validDays ?? null),
          },
          select: { id: true },
        });
        return prize?.title ?? WELCOME_REWARD.title;
      });
      return { token, prizeTitle };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        const target = JSON.stringify(error.meta?.target ?? '');
        if (target.includes('celular') || target.includes('phone')) {
          throw conflict('Este WhatsApp já está cadastrado no Clube Prigor. Entre com seu celular e PIN.');
        }
        continue; // colisão rara do código de indicação: tenta de novo
      }
      throw error;
    }
  }
  throw conflict('Não foi possível concluir o cadastro. Tente de novo.');
}

// ─── Login por celular + PIN ────────────────────────────────────────────────

export async function loginMember(phone: string, pin: string): Promise<{ token: string }> {
  const member = await prisma.loyaltyMember.findUnique({ where: { phone }, select: { id: true, pinHash: true } });
  // Mesma mensagem para número inexistente e PIN errado: não revela quem é cliente.
  const invalid = unauthorized('Celular ou PIN incorretos.');
  if (!member) throw invalid;
  if (!member.pinHash) throw badRequest('Seu cadastro ainda não tem PIN. Fale com a Prigor pelo WhatsApp para liberar.');
  if (!(await bcrypt.compare(pin, member.pinHash))) throw invalid;

  const { token, hash } = newLoyaltyToken();
  await prisma.loyaltyMember.update({ where: { id: member.id }, data: { sessionHash: hash }, select: { id: true } });
  return { token };
}

/** Esqueci o PIN: confere o código SMS, grava o PIN novo e já entra. */
export async function resetPinWithCode(phone: string, code: string, pin: string): Promise<{ token: string }> {
  const issue = pinProblem(pin);
  if (issue) throw badRequest(issue);
  await consumePhoneCode(phone, 'pin', code);
  const member = await prisma.loyaltyMember.findUnique({ where: { phone }, select: { id: true } });
  if (!member) throw badRequest('Código incorreto.');
  const { token, hash } = newLoyaltyToken();
  await prisma.loyaltyMember.update({
    where: { id: member.id },
    data: { pinHash: await bcrypt.hash(pin, PIN_ROUNDS), sessionHash: hash, phoneVerifiedAt: new Date() },
    select: { id: true },
  });
  return { token };
}

export async function logoutMember(sessionHash: string | null): Promise<void> {
  if (!sessionHash) return;
  await prisma.loyaltyMember.updateMany({ where: { sessionHash }, data: { sessionHash: null } });
}

/** Cria o PIN de quem se cadastrou antes de existir PIN. */
export async function setMemberPin(sessionHash: string | null, pin: string): Promise<MemberView> {
  const memberId = await memberIdFromSession(sessionHash);
  const issue = pinProblem(pin);
  if (issue) throw badRequest(issue);
  const updated = await prisma.loyaltyMember.updateMany({
    where: { id: memberId, pinHash: null },
    data: { pinHash: await bcrypt.hash(pin, PIN_ROUNDS) },
  });
  if (updated.count === 0) throw conflict('Você já tem um PIN. Para trocar, fale com a Prigor.');
  return viewOrThrow(sessionHash!);
}

// ─── Resgate no ponto ───────────────────────────────────────────────────────

/** Credita a indicação quando o amigo usa o cupom de boas-vindas (compra de verdade). */
async function creditReferral(tx: Tx, friendId: string, now: Date): Promise<void> {
  const friend = await tx.loyaltyMember.findUnique({ where: { id: friendId }, select: { referredById: true, name: true } });
  if (!friend?.referredById) return;
  const task = await tx.loyaltyTask.findFirst({ where: { proof: 'indicacao', active: true }, select: { points: true } });
  if (!task || task.points <= 0) return;
  const thisMonth = await tx.loyaltyPointEntry.count({
    where: { memberId: friend.referredById, reason: 'indicacao', createdAt: { gte: startOfMonthSaoPaulo(now) } },
  });
  if (thisMonth >= MAX_REFERRAL_CREDITS_PER_MONTH) return;
  const exists = await tx.loyaltyPointEntry.findUnique({ where: { referredMemberId: friendId }, select: { id: true } });
  if (exists) return;
  await tx.loyaltyPointEntry.create({
    data: {
      memberId: friend.referredById,
      delta: task.points,
      reason: 'indicacao',
      description: `Indicação: ${firstName(friend.name)} usou o cupom`,
      referredMemberId: friendId,
    },
    select: { id: true },
  });
}

/**
 * Resgate feito pelo próprio cliente, no ponto. O revendedor não faz nada:
 * só vê a tela ao vivo e entrega o produto. A bonificação fica pendente para
 * o ponto até ser reposta.
 */
export async function redeemReward(
  sessionHash: string | null,
  rewardId: string,
  pointCode: string,
  now = new Date(),
): Promise<MemberView> {
  const memberId = await memberIdFromSession(sessionHash);
  const point = await findPointByCode(pointCode);
  if (!point) throw notFound('Ponto de revenda');

  const reward = await prisma.loyaltyReward.findFirst({
    where: { id: rewardId, memberId },
    select: { id: true, status: true, expiresAt: true, reservedPointId: true, uniqueKey: true },
  });
  if (!reward) throw notFound('Cupom');

  const redeemedTodayAtPoint = await prisma.loyaltyReward.count({
    where: { redeemPointId: point.id, redeemedAt: { gte: startOfDaySaoPaulo(now) } },
  });
  const decision = checkRedeem({
    status: reward.status,
    redeemedTodayAtPoint,
    expiresAt: reward.expiresAt,
    reservedPointId: reward.reservedPointId,
    pointId: point.id,
    now,
  });
  if (!decision.ok) throw conflict(REDEEM_REFUSAL_MESSAGE[decision.reason]);

  await prisma.$transaction(async (tx) => {
    // Atômico: dois toques seguidos (ou duas abas) não resgatam duas vezes.
    const updated = await tx.loyaltyReward.updateMany({
      where: { id: reward.id, status: 'disponivel' },
      data: { status: 'usado', redeemedAt: now, redeemPointId: point.id },
    });
    if (updated.count === 0) throw conflict(REDEEM_REFUSAL_MESSAGE.cupom_usado);
    if (reward.uniqueKey?.startsWith('boas_vindas:')) await creditReferral(tx, memberId, now);
  });

  return viewOrThrow(sessionHash!, now);
}

// ─── Tarefas e troca de pontos ──────────────────────────────────────────────

export interface TaskProofInput {
  imageBase64: string;
  mime: string;
  note?: string | null;
}

export async function submitTaskProof(sessionHash: string | null, taskId: string, input: TaskProofInput): Promise<MemberView> {
  const memberId = await memberIdFromSession(sessionHash);
  const task = await prisma.loyaltyTask.findFirst({
    where: { id: taskId, active: true },
    select: { id: true, proof: true, cooldownDays: true },
  });
  if (!task) throw notFound('Tarefa');
  if (task.proof !== 'print') throw badRequest('Esta tarefa não usa print: os pontos entram sozinhos.');
  if (!PROOF_MIMES.has(input.mime)) throw badRequest('Envie uma imagem (JPG, PNG ou WEBP).');

  const image = Buffer.from(input.imageBase64, 'base64');
  if (image.length === 0) throw badRequest('Imagem vazia.');
  if (image.length > MAX_PROOF_BYTES) throw badRequest('Imagem grande demais. Tente um print menor.');

  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `clube:tarefa:${memberId}:${task.id}`);
    const subs = await tx.loyaltyTaskSubmission.findMany({
      where: { memberId, taskId: task.id },
      select: { status: true, createdAt: true },
    });
    const st = taskState({ cooldownDays: task.cooldownDays, submissions: subs, now: new Date() });
    if (st.state === 'em_analise') throw conflict('Seu print desta tarefa já está em análise.');
    if (st.state === 'concluida') throw conflict('Você já concluiu esta tarefa.');
    if (st.state === 'aguarde') throw conflict('Esta tarefa ainda não pode ser repetida.');
    await tx.loyaltyTaskSubmission.create({
      data: { memberId, taskId: task.id, proofImage: image, proofMime: input.mime, memberNote: input.note || null },
      select: { id: true },
    });
  });
  return viewOrThrow(sessionHash!);
}

export async function exchangePoints(sessionHash: string | null, prizeId: string): Promise<MemberView> {
  const memberId = await memberIdFromSession(sessionHash);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `clube:pontos:${memberId}`);
    const prize = await tx.loyaltyPrize.findFirst({
      where: { id: prizeId, active: true, pointsCost: { not: null }, stockPerPoint: null },
      select: { id: true, code: true, title: true, bonusUnits: true, pointsCost: true, requiresCheck: true, validDays: true },
    });
    if (!prize) throw notFound('Prêmio');
    const sum = await tx.loyaltyPointEntry.aggregate({ where: { memberId }, _sum: { delta: true } });
    const balance = sum._sum.delta ?? 0;
    if (balance < prize.pointsCost!) throw conflict(`Faltam ${prize.pointsCost! - balance} pontos para este prêmio.`);

    const reward = await tx.loyaltyReward.create({
      data: {
        memberId,
        kind: prize.code,
        title: prize.title,
        prizeId: prize.id,
        source: 'pontos',
        bonusUnits: prize.bonusUnits,
        requiresCheck: prize.requiresCheck,
        expiresAt: rewardExpiry(now, prize.validDays),
      },
      select: { id: true },
    });
    await tx.loyaltyPointEntry.create({
      data: { memberId, delta: -prize.pointsCost!, reason: 'troca', description: `Troca: ${prize.title}`, rewardId: reward.id },
      select: { id: true },
    });
  });
  return viewOrThrow(sessionHash!, now);
}
