import { describe, expect, it } from 'vitest';

import {
  checkOtpSend,
  checkRedeem,
  maskMobile,
  otpProblem,
  otpSmsText,
  drawOdds,
  drawPrize,
  freeStock,
  pinProblem,
  pointsBalance,
  rewardExpiry,
  startOfMonthSaoPaulo,
  taskState,
  firstName,
  formatMobile,
  isValidPointCode,
  liveSecondsLeft,
  normalizeMobile,
  pointCodeFromBytes,
  POINT_DAILY_REDEEM_LIMIT,
  startOfDaySaoPaulo,
  sumBonusUnits,
} from '@/server/domain/loyalty';

describe('normalizeMobile', () => {
  it('aceita os formatos comuns e devolve só os 11 dígitos', () => {
    expect(normalizeMobile('(21) 98765-4321')).toBe('21987654321');
    expect(normalizeMobile('+55 21 98765 4321')).toBe('21987654321');
    expect(normalizeMobile('21987654321')).toBe('21987654321');
  });

  it('recusa fixo, número curto e DDD inválido', () => {
    expect(normalizeMobile('2133334444')).toBeNull();
    expect(normalizeMobile('21 3333-4444')).toBeNull();
    expect(normalizeMobile('987654321')).toBeNull();
    expect(normalizeMobile('05987654321')).toBeNull();
    expect(normalizeMobile('21887654321')).toBeNull();
  });

  it('formata para exibição', () => {
    expect(formatMobile('21987654321')).toBe('(21) 98765-4321');
  });
});

describe('firstName', () => {
  it('pega o primeiro nome com inicial maiúscula', () => {
    expect(firstName('  maria DA silva ')).toBe('Maria');
    expect(firstName('')).toBe('');
  });
});

describe('código do ponto', () => {
  it('gera 6 caracteres do alfabeto sem ambíguos', () => {
    const code = pointCodeFromBytes(new Uint8Array([0, 1, 2, 30, 31, 255]));
    expect(code).toHaveLength(6);
    expect(isValidPointCode(code)).toBe(true);
    expect(code).not.toMatch(/[01ilo]/);
  });

  it('valida o formato', () => {
    expect(isValidPointCode('abc234')).toBe(true);
    expect(isValidPointCode('ABC234')).toBe(false);
    expect(isValidPointCode('abc10o')).toBe(false);
    expect(isValidPointCode('abc23')).toBe(false);
  });
});

describe('checkRedeem', () => {
  it('libera cupom disponível', () => {
    expect(checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: 0 })).toEqual({ ok: true });
  });

  it('recusa cupom já usado', () => {
    expect(checkRedeem({ status: 'usado', redeemedTodayAtPoint: 0 })).toEqual({ ok: false, reason: 'cupom_usado' });
  });

  it('recusa quando o ponto bateu o teto do dia', () => {
    expect(checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: POINT_DAILY_REDEEM_LIMIT })).toEqual({
      ok: false,
      reason: 'limite_diario_ponto',
    });
    expect(checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: 2, dailyLimit: 2 }).ok).toBe(false);
  });
});

describe('liveSecondsLeft', () => {
  const t0 = new Date('2026-11-23T20:00:00Z');
  it('conta 180 s a partir do resgate', () => {
    expect(liveSecondsLeft(t0, t0)).toBe(180);
    expect(liveSecondsLeft(t0, new Date('2026-11-23T20:01:00Z'))).toBe(120);
    expect(liveSecondsLeft(t0, new Date('2026-11-23T20:05:00Z'))).toBe(0);
    expect(liveSecondsLeft(null, t0)).toBe(0);
  });

  it('relógio do servidor um pouco atrasado não passa de 180', () => {
    expect(liveSecondsLeft(t0, new Date('2026-11-23T19:59:50Z'))).toBe(180);
  });
});

describe('startOfDaySaoPaulo', () => {
  it('meia-noite de Brasília em UTC', () => {
    // 23/11 22:30 em SP = 24/11 01:30 UTC → início do dia 23/11 em SP = 23/11 03:00 UTC
    expect(startOfDaySaoPaulo(new Date('2026-11-24T01:30:00Z')).toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect(startOfDaySaoPaulo(new Date('2026-11-23T03:00:00Z')).toISOString()).toBe('2026-11-23T03:00:00.000Z');
  });
});

describe('sumBonusUnits', () => {
  it('soma em Decimal', () => {
    expect(sumBonusUnits(['1', 1, '0.5']).toNumber()).toBe(2.5);
    expect(sumBonusUnits([]).toNumber()).toBe(0);
  });
});

describe('checkRedeem — validade e ponto reservado', () => {
  const now = new Date('2026-11-23T20:00:00Z');
  it('recusa prêmio vencido', () => {
    expect(
      checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: 0, expiresAt: new Date('2026-11-22T00:00:00Z'), now }),
    ).toEqual({ ok: false, reason: 'cupom_vencido' });
  });
  it('recusa brinde reservado para outro ponto e aceita no ponto certo', () => {
    expect(checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: 0, reservedPointId: 'A', pointId: 'B', now })).toEqual({
      ok: false,
      reason: 'outro_ponto',
    });
    expect(checkRedeem({ status: 'disponivel', redeemedTodayAtPoint: 0, reservedPointId: 'A', pointId: 'A', now }).ok).toBe(true);
  });
  it('anulado conta como usado', () => {
    expect(checkRedeem({ status: 'anulado', redeemedTodayAtPoint: 0 }).ok).toBe(false);
  });
});

describe('drawPrize', () => {
  const cands = [
    { id: 'a', weight: 700, available: true },
    { id: 'b', weight: 295, available: true },
    { id: 'bolsa', weight: 5, available: true },
  ];
  it('respeita as faixas de peso', () => {
    expect(drawPrize(cands, 0)).toBe('a');
    expect(drawPrize(cands, 0.6999)).toBe('a');
    expect(drawPrize(cands, 0.7)).toBe('b');
    expect(drawPrize(cands, 0.9949)).toBe('b');
    expect(drawPrize(cands, 0.996)).toBe('bolsa');
    expect(drawPrize(cands, 0.99999)).toBe('bolsa');
  });
  it('tira do sorteio o brinde sem estoque', () => {
    const semBolsa = cands.map((c) => (c.id === 'bolsa' ? { ...c, available: false } : c));
    expect(drawPrize(semBolsa, 0.99999)).toBe('b');
  });
  it('sem candidatos devolve null', () => {
    expect(drawPrize([{ id: 'x', weight: 0, available: true }], 0.5)).toBeNull();
    expect(drawPrize([], 0.5)).toBeNull();
  });
  it('distribuição aproximada com 100 mil sorteios', () => {
    let bolsa = 0;
    for (let i = 0; i < 100_000; i++) if (drawPrize(cands, i / 100_000) === 'bolsa') bolsa++;
    expect(bolsa).toBe(500);
  });
});

describe('drawOdds / freeStock / rewardExpiry', () => {
  it('calcula a chance em %', () => {
    const odds = drawOdds([{ id: 'a', weight: 995 }, { id: 'b', weight: 5 }]);
    expect(odds.get('b')).toBeCloseTo(0.5);
  });
  it('estoque livre nunca negativo; null = sem limite', () => {
    expect(freeStock(10, 3)).toBe(7);
    expect(freeStock(10, 12)).toBe(0);
    expect(freeStock(null, 99)).toBeNull();
  });
  it('validade em dias', () => {
    const now = new Date('2026-11-23T20:00:00Z');
    expect(rewardExpiry(now, 15)?.toISOString()).toBe('2026-12-08T20:00:00.000Z');
    expect(rewardExpiry(now, null)).toBeNull();
  });
});

describe('pinProblem', () => {
  it('aceita PIN válido e recusa óbvios', () => {
    expect(pinProblem('4829')).toBeNull();
    expect(pinProblem('123')).not.toBeNull();
    expect(pinProblem('abcd')).not.toBeNull();
    expect(pinProblem('1111')).not.toBeNull();
    expect(pinProblem('1234')).not.toBeNull();
    expect(pinProblem('9876')).not.toBeNull();
  });
});

describe('taskState', () => {
  const now = new Date('2026-11-23T20:00:00Z');
  const d = (iso: string) => new Date(iso);
  it('disponível sem envios; recusado não conta', () => {
    expect(taskState({ cooldownDays: null, submissions: [], now })).toEqual({ state: 'disponivel' });
    expect(taskState({ cooldownDays: null, submissions: [{ status: 'recusado', createdAt: d('2026-11-22T00:00:00Z') }], now })).toEqual({
      state: 'disponivel',
    });
  });
  it('em análise quando há pendente', () => {
    expect(taskState({ cooldownDays: 7, submissions: [{ status: 'pendente', createdAt: d('2026-11-23T10:00:00Z') }], now }).state).toBe(
      'em_analise',
    );
  });
  it('única vez: concluída depois de aprovada', () => {
    expect(taskState({ cooldownDays: null, submissions: [{ status: 'aprovado', createdAt: d('2026-10-01T00:00:00Z') }], now }).state).toBe(
      'concluida',
    );
  });
  it('semanal: aguarda 7 dias desde o último envio', () => {
    const r = taskState({ cooldownDays: 7, submissions: [{ status: 'aprovado', createdAt: d('2026-11-20T20:00:00Z') }], now });
    expect(r).toEqual({ state: 'aguarde', nextAt: d('2026-11-27T20:00:00Z') });
    expect(taskState({ cooldownDays: 7, submissions: [{ status: 'aprovado', createdAt: d('2026-11-16T20:00:00Z') }], now }).state).toBe(
      'disponivel',
    );
  });
});

describe('pointsBalance / startOfMonthSaoPaulo', () => {
  it('soma o extrato', () => {
    expect(pointsBalance([50, 20, -100, 40])).toBe(10);
  });
  it('início do mês em Brasília', () => {
    expect(startOfMonthSaoPaulo(new Date('2026-12-01T02:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('código SMS', () => {
  const now = new Date('2026-11-23T20:00:00Z');
  it('otpProblem', () => {
    const base = { expiresAt: new Date('2026-11-23T20:05:00Z'), attempts: 0, usedAt: null };
    expect(otpProblem(base, now)).toBeNull();
    expect(otpProblem(null, now)).toBe('nenhum_codigo');
    expect(otpProblem({ ...base, usedAt: now }, now)).toBe('usado');
    expect(otpProblem({ ...base, attempts: 5 }, now)).toBe('tentativas');
    expect(otpProblem({ ...base, expiresAt: new Date('2026-11-23T19:59:00Z') }, now)).toBe('expirado');
  });
  it('checkOtpSend', () => {
    const base = { lastSentAt: null, sentLastHour: 0, sentToday: 0, dailyLimit: 300, now };
    expect(checkOtpSend(base)).toBeNull();
    expect(checkOtpSend({ ...base, lastSentAt: new Date('2026-11-23T19:59:30Z') })).toEqual({ reason: 'aguarde', seconds: 30 });
    expect(checkOtpSend({ ...base, lastSentAt: new Date('2026-11-23T19:58:00Z'), sentLastHour: 3 })).toEqual({ reason: 'limite_celular' });
    expect(checkOtpSend({ ...base, sentToday: 300 })).toEqual({ reason: 'limite_diario' });
  });
  it('texto do SMS cabe em 160 caracteres e não tem acento', () => {
    for (const p of ['cadastro', 'pin'] as const) {
      const t = otpSmsText('482913', p);
      expect(t.length).toBeLessThanOrEqual(160);
      expect(t).toMatch(/^[\x20-\x7E]+$/);
    }
  });
  it('mascara o celular', () => {
    expect(maskMobile('21987654321')).toBe('(21) 9****-4321');
  });
});
