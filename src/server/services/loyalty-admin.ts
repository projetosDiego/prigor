/**
 * Clube Prigor — gestão (pontos de revenda, estoque de brindes, prêmios,
 * tarefas, análise de prints, segunda via e ajustes de clientes).
 */
import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

import { prisma, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import type { SessionPayload } from '../auth/guard';
import {
  drawOdds,
  formatMobile,
  freeStock,
  pinProblem,
  pointCodeFromBytes,
  pointsBalance,
  rewardExpiry,
  sumBonusUnits,
} from '../domain/loyalty';
import { toNumber } from '../domain/money';
import { audit } from './audit';
import { committedStock, configuredStock, lockKey } from './loyalty';

// ─── Visão geral ────────────────────────────────────────────────────────────

export interface PointStockView {
  prizeId: string;
  title: string;
  stock: number;
  committed: number;
  free: number;
}

export interface LoyaltyPointRow {
  customerId: string;
  name: string;
  neighborhood: string | null;
  code: string | null;
  signups: number;
  redemptions: number;
  pendingUnits: number;
  stocks: PointStockView[];
}

export interface LoyaltyMemberRow {
  id: string;
  name: string;
  phone: string;
  phoneDigits: string;
  neighborhood: string | null;
  marketingConsent: boolean;
  whatsappConfirmed: boolean;
  phoneVerified: boolean;
  signupPointName: string | null;
  welcomeTitle: string | null;
  welcomeStatus: string | null;
  points: number;
  createdAt: string;
}

export interface LoyaltyOverview {
  totals: { members: number; withConsent: number; redeemed: number; pendingUnits: number; pendingReviews: number };
  points: LoyaltyPointRow[];
  members: LoyaltyMemberRow[];
}

export async function getLoyaltyOverview(search?: string): Promise<LoyaltyOverview> {
  const term = search?.trim();
  const digits = term?.replace(/\D/g, '') ?? '';
  const memberWhere: Prisma.LoyaltyMemberWhereInput = term
    ? {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : {};
  const now = new Date();

  const [
    members,
    withConsent,
    redeemed,
    pending,
    pendingReviews,
    signupsByPoint,
    redemptionsByPoint,
    pendingByPoint,
    pointsWithCode,
    memberRows,
    limitedPrizes,
  ] = await Promise.all([
    prisma.loyaltyMember.count(),
    prisma.loyaltyMember.count({ where: { marketingConsent: true } }),
    prisma.loyaltyReward.count({ where: { status: 'usado' } }),
    prisma.loyaltyReward.aggregate({ where: { status: 'usado', settledAt: null }, _sum: { bonusUnits: true } }),
    prisma.loyaltyTaskSubmission.count({ where: { status: 'pendente' } }),
    prisma.loyaltyMember.groupBy({ by: ['signupPointId'], _count: { _all: true } }),
    prisma.loyaltyReward.groupBy({ by: ['redeemPointId'], where: { status: 'usado' }, _count: { _all: true } }),
    prisma.loyaltyReward.groupBy({
      by: ['redeemPointId'],
      where: { status: 'usado', settledAt: null },
      _sum: { bonusUnits: true },
    }),
    prisma.customer.findMany({
      where: { loyaltyCode: { not: null } },
      select: { id: true, tradeName: true, neighborhood: true, loyaltyCode: true },
    }),
    prisma.loyaltyMember.findMany({
      where: memberWhere,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        name: true,
        phone: true,
        neighborhood: true,
        marketingConsent: true,
        whatsappConfirmedAt: true,
        phoneVerifiedAt: true,
        createdAt: true,
        signupPoint: { select: { tradeName: true } },
        rewards: { where: { source: 'boas_vindas' }, select: { title: true, status: true }, take: 1 },
      },
    }),
    prisma.loyaltyPrize.findMany({
      where: { stockPerPoint: { not: null }, active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, stockPerPoint: true },
    }),
  ]);

  const balances = memberRows.length
    ? await prisma.loyaltyPointEntry.groupBy({
        by: ['memberId'],
        where: { memberId: { in: memberRows.map((m) => m.id) } },
        _sum: { delta: true },
      })
    : [];
  const balanceMap = new Map(balances.map((b) => [b.memberId, b._sum.delta ?? 0]));

  const signups = new Map(signupsByPoint.map((g) => [g.signupPointId, g._count._all]));
  const redemptions = new Map(redemptionsByPoint.map((g) => [g.redeemPointId, g._count._all]));
  const pendingMap = new Map(pendingByPoint.map((g) => [g.redeemPointId, toNumber(g._sum.bonusUnits)]));

  const ids = new Set<string>(pointsWithCode.map((p) => p.id));
  const orphanIds = [...pendingMap.keys()].filter((id): id is string => !!id && !ids.has(id));
  const orphans = orphanIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: orphanIds } },
        select: { id: true, tradeName: true, neighborhood: true, loyaltyCode: true },
      })
    : [];

  const allPoints = [...pointsWithCode, ...orphans];
  const stockByPoint = new Map<string, PointStockView[]>();
  for (const p of pointsWithCode) {
    const configured = await configuredStock(prisma, p.id, limitedPrizes);
    const used = await committedStock(prisma, p.id, limitedPrizes.map((l) => l.id), now);
    stockByPoint.set(
      p.id,
      limitedPrizes.map((l) => {
        const stock = configured.get(l.id) ?? 0;
        const committed = used.get(l.id) ?? 0;
        return { prizeId: l.id, title: l.title, stock, committed, free: freeStock(stock, committed) ?? 0 };
      }),
    );
  }

  const points = allPoints
    .map((p) => ({
      customerId: p.id,
      name: p.tradeName,
      neighborhood: p.neighborhood,
      code: p.loyaltyCode,
      signups: signups.get(p.id) ?? 0,
      redemptions: redemptions.get(p.id) ?? 0,
      pendingUnits: pendingMap.get(p.id) ?? 0,
      stocks: stockByPoint.get(p.id) ?? [],
    }))
    .sort((a, b) => b.pendingUnits - a.pendingUnits || b.signups - a.signups || a.name.localeCompare(b.name));

  return {
    totals: { members, withConsent, redeemed, pendingUnits: toNumber(pending._sum.bonusUnits), pendingReviews },
    points,
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      phone: formatMobile(m.phone),
      phoneDigits: m.phone,
      neighborhood: m.neighborhood,
      marketingConsent: m.marketingConsent,
      whatsappConfirmed: !!m.whatsappConfirmedAt,
      phoneVerified: !!m.phoneVerifiedAt,
      signupPointName: m.signupPoint?.tradeName ?? null,
      welcomeTitle: m.rewards[0]?.title ?? null,
      welcomeStatus: m.rewards[0]?.status ?? null,
      points: balanceMap.get(m.id) ?? 0,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

// ─── Pontos de revenda ──────────────────────────────────────────────────────

/** Coloca o ponto no Clube: gera o código do QR do balcão (se ainda não tiver). */
export async function enableLoyaltyPoint(session: SessionPayload, customerId: string): Promise<{ code: string }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, loyaltyCode: true } });
  if (!customer) throw notFound('Cliente');
  if (customer.loyaltyCode) return { code: customer.loyaltyCode };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = pointCodeFromBytes(randomBytes(16));
    try {
      await prisma.customer.update({ where: { id: customerId }, data: { loyaltyCode: code }, select: { id: true } });
      await audit(session, 'clube.ponto_ativado', 'customer', customerId, { code });
      return { code };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) continue;
      throw error;
    }
  }
  throw conflict('Não foi possível gerar um código único. Tente de novo.');
}

/** Ajusta quantas unidades de um brinde limitado o ponto recebeu. */
export async function setPointStock(session: SessionPayload, customerId: string, prizeId: string, quantity: number): Promise<void> {
  const prize = await prisma.loyaltyPrize.findUnique({ where: { id: prizeId }, select: { stockPerPoint: true } });
  if (!prize) throw notFound('Prêmio');
  if (prize.stockPerPoint === null) throw badRequest('Este prêmio não tem controle de estoque.');
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw notFound('Cliente');
  await prisma.loyaltyPointStock.upsert({
    where: { customerId_prizeId: { customerId, prizeId } },
    create: { customerId, prizeId, quantity },
    update: { quantity },
    select: { id: true },
  });
  await audit(session, 'clube.estoque_ajustado', 'customer', customerId, { prizeId, quantity });
}

/**
 * Marca como reposta toda a bonificação pendente do ponto. Opcionalmente liga
 * ao pedido em que os brownies foram enviados.
 */
export async function settlePointBonus(
  session: SessionPayload,
  customerId: string,
  orderNumber: number | null,
): Promise<{ rewards: number; units: number }> {
  let orderId: string | null = null;
  if (orderNumber !== null) {
    const order = await prisma.order.findUnique({ where: { numero: orderNumber }, select: { id: true, customerId: true } });
    if (!order) throw notFound(`Pedido nº ${orderNumber}`);
    if (order.customerId !== customerId) throw badRequest(`O pedido nº ${orderNumber} é de outro cliente.`);
    orderId = order.id;
  }

  const where: Prisma.LoyaltyRewardWhereInput = { redeemPointId: customerId, status: 'usado', settledAt: null };
  const result = await prisma.$transaction(async (tx) => {
    const pendingRows = await tx.loyaltyReward.findMany({ where, select: { id: true, bonusUnits: true } });
    if (pendingRows.length === 0) return { rewards: 0, units: 0 };
    await tx.loyaltyReward.updateMany({
      where: { id: { in: pendingRows.map((p) => p.id) } },
      data: { settledAt: new Date(), settledOrderId: orderId, settledById: session.userId },
    });
    return { rewards: pendingRows.length, units: toNumber(sumBonusUnits(pendingRows.map((p) => p.bonusUnits))) };
  });

  if (result.rewards > 0) {
    await audit(session, 'clube.bonificacao_reposta', 'customer', customerId, { ...result, orderNumber });
  }
  return result;
}

// ─── Prêmios ────────────────────────────────────────────────────────────────

export interface PrizeInput {
  code?: string;
  title: string;
  description: string | null;
  bonusUnits: string;
  drawWeight: number;
  pointsCost: number | null;
  stockPerPoint: number | null;
  requiresCheck: boolean;
  validDays: number | null;
  active: boolean;
  sortOrder: number;
}

function assertPrizeRules(input: PrizeInput): void {
  if (input.pointsCost !== null && input.stockPerPoint !== null) {
    throw badRequest('Brinde com estoque por ponto não pode ser trocado por pontos (o estoque é do ponto onde foi ganho).');
  }
}

export async function listPrizes() {
  const rows = await prisma.loyaltyPrize.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] });
  const odds = drawOdds(rows.filter((r) => r.active).map((r) => ({ id: r.id, weight: r.drawWeight })));
  const won = await prisma.loyaltyReward.groupBy({ by: ['prizeId'], _count: { _all: true } });
  const wonMap = new Map(won.map((w) => [w.prizeId, w._count._all]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    bonusUnits: toNumber(r.bonusUnits),
    drawWeight: r.drawWeight,
    oddsPct: odds.get(r.id) ?? 0,
    pointsCost: r.pointsCost,
    stockPerPoint: r.stockPerPoint,
    requiresCheck: r.requiresCheck,
    validDays: r.validDays,
    active: r.active,
    sortOrder: r.sortOrder,
    timesWon: wonMap.get(r.id) ?? 0,
  }));
}

export async function savePrize(session: SessionPayload, id: string | null, input: PrizeInput): Promise<void> {
  assertPrizeRules(input);
  const data = {
    title: input.title,
    description: input.description,
    bonusUnits: new Prisma.Decimal(input.bonusUnits),
    drawWeight: input.drawWeight,
    pointsCost: input.pointsCost,
    stockPerPoint: input.stockPerPoint,
    requiresCheck: input.requiresCheck,
    validDays: input.validDays,
    active: input.active,
    sortOrder: input.sortOrder,
  };
  try {
    if (id) {
      await prisma.loyaltyPrize.update({ where: { id }, data, select: { id: true } });
    } else {
      const code = (input.code || input.title)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40);
      await prisma.loyaltyPrize.create({ data: { ...data, code: code || `premio_${Date.now()}` }, select: { id: true } });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      throw conflict('Já existe um prêmio com esse nome/código.');
    }
    throw error;
  }
  await audit(session, id ? 'clube.premio_editado' : 'clube.premio_criado', 'loyalty_prize', id, { ...input });
}

// ─── Tarefas ────────────────────────────────────────────────────────────────

export interface TaskInput {
  title: string;
  description: string | null;
  points: number;
  actionUrl: string | null;
  actionLabel: string | null;
  cooldownDays: number | null;
  active: boolean;
  sortOrder: number;
}

export async function listTasks() {
  const rows = await prisma.loyaltyTask.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] });
  const counts = await prisma.loyaltyTaskSubmission.groupBy({ by: ['taskId', 'status'], _count: { _all: true } });
  const referrals = await prisma.loyaltyPointEntry.count({ where: { reason: 'indicacao' } });
  return rows.map((r) => {
    const c = (status: string) => counts.find((x) => x.taskId === r.id && x.status === status)?._count._all ?? 0;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      description: r.description,
      points: r.points,
      actionUrl: r.actionUrl,
      actionLabel: r.actionLabel,
      proof: r.proof,
      cooldownDays: r.cooldownDays,
      active: r.active,
      sortOrder: r.sortOrder,
      approved: r.proof === 'indicacao' ? referrals : c('aprovado'),
      pending: c('pendente'),
      rejected: c('recusado'),
    };
  });
}

export async function saveTask(session: SessionPayload, id: string | null, input: TaskInput): Promise<void> {
  if (id) {
    const exists = await prisma.loyaltyTask.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('Tarefa');
    await prisma.loyaltyTask.update({ where: { id }, data: input, select: { id: true } });
  } else {
    await prisma.loyaltyTask.create({
      data: { ...input, code: `tarefa_${Date.now().toString(36)}`, proof: 'print' },
      select: { id: true },
    });
  }
  await audit(session, id ? 'clube.tarefa_editada' : 'clube.tarefa_criada', 'loyalty_task', id, { ...input });
}

// ─── Análise de prints ──────────────────────────────────────────────────────

export async function listSubmissions(status: string) {
  const rows = await prisma.loyaltyTaskSubmission.findMany({
    where: { status },
    orderBy: { createdAt: status === 'pendente' ? 'asc' : 'desc' },
    take: 200,
    select: {
      id: true,
      status: true,
      memberNote: true,
      reviewNote: true,
      points: true,
      createdAt: true,
      reviewedAt: true,
      task: { select: { title: true, points: true } },
      member: { select: { id: true, name: true, phone: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    taskTitle: r.task.title,
    taskPoints: r.task.points,
    memberId: r.member.id,
    memberName: r.member.name,
    memberPhone: formatMobile(r.member.phone),
    memberPhoneDigits: r.member.phone,
    memberNote: r.memberNote,
    reviewNote: r.reviewNote,
    points: r.points,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));
}

export async function getSubmissionImage(id: string): Promise<{ data: Uint8Array; mime: string }> {
  const row = await prisma.loyaltyTaskSubmission.findUnique({ where: { id }, select: { proofImage: true, proofMime: true } });
  if (!row?.proofImage) throw notFound('Imagem');
  return { data: row.proofImage, mime: row.proofMime ?? 'image/jpeg' };
}

export async function reviewSubmission(session: SessionPayload, id: string, approve: boolean, note: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sub = await tx.loyaltyTaskSubmission.findUnique({
      where: { id },
      select: { id: true, status: true, memberId: true, task: { select: { title: true, points: true } } },
    });
    if (!sub) throw notFound('Envio');
    const updated = await tx.loyaltyTaskSubmission.updateMany({
      where: { id, status: 'pendente' },
      data: {
        status: approve ? 'aprovado' : 'recusado',
        reviewNote: note,
        points: approve ? sub.task.points : 0,
        reviewedAt: new Date(),
        reviewedById: session.userId,
      },
    });
    if (updated.count === 0) throw conflict('Este envio já foi analisado.');
    if (approve && sub.task.points > 0) {
      await tx.loyaltyPointEntry.create({
        data: {
          memberId: sub.memberId,
          delta: sub.task.points,
          reason: 'tarefa',
          description: sub.task.title,
          submissionId: sub.id,
          createdById: session.userId,
        },
        select: { id: true },
      });
    }
  });
  await audit(session, approve ? 'clube.envio_aprovado' : 'clube.envio_recusado', 'loyalty_submission', id, { note });
}

// ─── Cliente: detalhe, PIN, pontos, prêmio manual, segunda via ─────────────

export async function getMemberDetail(id: string) {
  const m = await prisma.loyaltyMember.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      neighborhood: true,
      marketingConsent: true,
      whatsappConfirmedAt: true,
      phoneVerifiedAt: true,
      pinHash: true,
      createdAt: true,
      signupPoint: { select: { tradeName: true } },
      referredBy: { select: { name: true } },
      rewards: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          source: true,
          status: true,
          expiresAt: true,
          redeemedAt: true,
          settledAt: true,
          note: true,
          createdAt: true,
          redeemPoint: { select: { tradeName: true } },
          reservedPoint: { select: { tradeName: true } },
        },
      },
      points: { orderBy: { createdAt: 'desc' }, select: { delta: true, reason: true, description: true, createdAt: true } },
    },
  });
  if (!m) throw notFound('Cliente do Clube');
  const now = Date.now();
  return {
    id: m.id,
    name: m.name,
    phone: formatMobile(m.phone),
    phoneDigits: m.phone,
    neighborhood: m.neighborhood,
    marketingConsent: m.marketingConsent,
    whatsappConfirmed: !!m.whatsappConfirmedAt,
    phoneVerified: !!m.phoneVerifiedAt,
    hasPin: !!m.pinHash,
    createdAt: m.createdAt.toISOString(),
    signupPointName: m.signupPoint?.tradeName ?? null,
    referredByName: m.referredBy?.name ?? null,
    points: pointsBalance(m.points.map((p) => p.delta)),
    rewards: m.rewards.map((r) => ({
      id: r.id,
      title: r.title,
      source: r.source,
      status: r.status,
      expired: r.status === 'disponivel' && !!r.expiresAt && r.expiresAt.getTime() < now,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      redeemedAt: r.redeemedAt?.toISOString() ?? null,
      redeemPointName: r.redeemPoint?.tradeName ?? null,
      reservedPointName: r.reservedPoint?.tradeName ?? null,
      settled: !!r.settledAt,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    history: m.points.map((p) => ({
      delta: p.delta,
      reason: p.reason,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

/** Gera um PIN novo (cliente esqueceu). Devolve o PIN para você mandar pelo WhatsApp. */
export async function resetMemberPin(session: SessionPayload, id: string): Promise<{ pin: string }> {
  let pin = '';
  do pin = String(randomInt(0, 10_000)).padStart(4, '0');
  while (pinProblem(pin));
  const exists = await prisma.loyaltyMember.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Cliente do Clube');
  await prisma.loyaltyMember.update({
    where: { id },
    // Derruba a sessão antiga: o cliente entra de novo com o PIN novo.
    data: { pinHash: await bcrypt.hash(pin, 10), sessionHash: null },
    select: { id: true },
  });
  await audit(session, 'clube.pin_redefinido', 'loyalty_member', id);
  return { pin };
}

export async function adjustMemberPoints(session: SessionPayload, id: string, delta: number, description: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `clube:pontos:${id}`);
    const exists = await tx.loyaltyMember.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('Cliente do Clube');
    if (delta < 0) {
      const sum = await tx.loyaltyPointEntry.aggregate({ where: { memberId: id }, _sum: { delta: true } });
      if ((sum._sum.delta ?? 0) + delta < 0) throw badRequest('O saldo do cliente ficaria negativo.');
    }
    await tx.loyaltyPointEntry.create({
      data: { memberId: id, delta, reason: 'ajuste', description, createdById: session.userId },
      select: { id: true },
    });
  });
  await audit(session, 'clube.pontos_ajustados', 'loyalty_member', id, { delta, description });
}

/** Dá um prêmio do catálogo direto ao cliente (cortesia, compensação...). */
export async function grantPrize(session: SessionPayload, memberId: string, prizeId: string, note: string | null): Promise<void> {
  const [member, prize] = await Promise.all([
    prisma.loyaltyMember.findUnique({ where: { id: memberId }, select: { id: true } }),
    prisma.loyaltyPrize.findUnique({
      where: { id: prizeId },
      select: { id: true, code: true, title: true, bonusUnits: true, requiresCheck: true, validDays: true, stockPerPoint: true },
    }),
  ]);
  if (!member) throw notFound('Cliente do Clube');
  if (!prize) throw notFound('Prêmio');
  if (prize.stockPerPoint !== null) throw badRequest('Brinde com estoque por ponto não pode ser dado manualmente. Use a segunda via.');
  await prisma.loyaltyReward.create({
    data: {
      memberId,
      kind: prize.code,
      title: prize.title,
      prizeId: prize.id,
      source: 'manual',
      bonusUnits: prize.bonusUnits,
      requiresCheck: prize.requiresCheck,
      expiresAt: rewardExpiry(new Date(), prize.validDays),
      note,
    },
    select: { id: true },
  });
  await audit(session, 'clube.premio_concedido', 'loyalty_member', memberId, { prizeId, note });
}

/**
 * Segunda via: o cliente teve problema no balcão (ou deixou vencer) e abriu
 * chamado no WhatsApp. O cupom antigo é anulado (sai da bonificação pendente
 * e libera o estoque) e nasce um novo, igual, disponível.
 */
export async function reissueReward(session: SessionPayload, rewardId: string, reason: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const old = await tx.loyaltyReward.findUnique({
      where: { id: rewardId },
      select: {
        id: true,
        memberId: true,
        kind: true,
        title: true,
        prizeId: true,
        bonusUnits: true,
        requiresCheck: true,
        reservedPointId: true,
        status: true,
        expiresAt: true,
        settledAt: true,
        prize: { select: { validDays: true } },
      },
    });
    if (!old) throw notFound('Cupom');
    const expired = old.status === 'disponivel' && !!old.expiresAt && old.expiresAt < now;
    if (old.status === 'disponivel' && !expired) throw badRequest('Este cupom ainda está disponível para o cliente usar.');
    if (old.status === 'anulado') throw badRequest('Este cupom já foi substituído por uma segunda via.');

    // Já reposto ao ponto: o antigo fica como histórico; senão, anula.
    if (!old.settledAt) {
      await tx.loyaltyReward.update({
        where: { id: old.id },
        data: { status: 'anulado', note: `Substituído por segunda via: ${reason}` },
        select: { id: true },
      });
    }
    await tx.loyaltyReward.create({
      data: {
        memberId: old.memberId,
        kind: old.kind,
        title: old.title,
        prizeId: old.prizeId,
        source: 'segunda_via',
        bonusUnits: old.bonusUnits,
        requiresCheck: old.requiresCheck,
        reservedPointId: old.reservedPointId,
        expiresAt: rewardExpiry(now, old.prize?.validDays ?? (old.expiresAt ? 7 : null)),
        reissuedFromId: old.id,
        note: reason,
      },
      select: { id: true },
    });
  });
  await audit(session, 'clube.segunda_via', 'loyalty_reward', rewardId, { reason });
}

/**
 * Exclui o cliente do Clube (testes, pedido de exclusão pela LGPD).
 * Leva junto prêmios, pontos e prints; os códigos SMS do número também saem,
 * para o mesmo celular poder se cadastrar de novo na hora.
 */
export async function deleteMember(session: SessionPayload, id: string): Promise<void> {
  const member = await prisma.loyaltyMember.findUnique({ where: { id }, select: { id: true, phone: true, name: true } });
  if (!member) throw notFound('Cliente do Clube');
  await prisma.$transaction(async (tx) => {
    await tx.loyaltyPhoneCode.deleteMany({ where: { phone: member.phone } });
    // Prêmios, pontos e prints saem em cascata; quem ele indicou só perde o vínculo.
    await tx.loyaltyMember.delete({ where: { id }, select: { id: true } });
  });
  await audit(session, 'clube.membro_excluido', 'loyalty_member', id, { name: member.name, phone: formatMobile(member.phone) });
}

export async function confirmMemberWhatsapp(session: SessionPayload, memberId: string, confirmed: boolean): Promise<void> {
  const exists = await prisma.loyaltyMember.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!exists) throw notFound('Membro do Clube');
  await prisma.loyaltyMember.update({
    where: { id: memberId },
    data: { whatsappConfirmedAt: confirmed ? new Date() : null },
    select: { id: true },
  });
  await audit(session, confirmed ? 'clube.whatsapp_confirmado' : 'clube.whatsapp_desconfirmado', 'loyalty_member', memberId);
}

/** CSV da base (para disparos no WhatsApp). Só quem autorizou receber mensagens. */
export async function exportMembersCsv(): Promise<string> {
  const rows = await prisma.loyaltyMember.findMany({
    where: { marketingConsent: true },
    orderBy: { createdAt: 'asc' },
    select: {
      name: true,
      phone: true,
      neighborhood: true,
      createdAt: true,
      whatsappConfirmedAt: true,
      signupPoint: { select: { tradeName: true } },
    },
  });
  const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const lines = ['nome;whatsapp;bairro;ponto_cadastro;cadastrado_em;whatsapp_confirmado'];
  for (const r of rows) {
    lines.push(
      [
        esc(r.name),
        `55${r.phone}`,
        esc(r.neighborhood ?? ''),
        esc(r.signupPoint?.tradeName ?? ''),
        r.createdAt.toISOString().slice(0, 10),
        r.whatsappConfirmedAt ? 'sim' : 'nao',
      ].join(';'),
    );
  }
  return '﻿' + lines.join('\r\n');
}
