/**
 * Aritmética de dinheiro e quantidade.
 *
 * Regra do projeto: valor monetário NUNCA é `number`. Float binário não
 * representa 0,10 exatamente, e num ERP esse erro vira centavo perdido em
 * relatório e comissão. Todo cálculo passa por Decimal e só vira string na
 * fronteira da API.
 *
 * Convenções:
 *  - dinheiro:    2 casas, arredondamento HALF_UP (o que a contabilidade espera)
 *  - quantidade:  3 casas, HALF_UP
 *  - percentual:  2 casas
 */
import { Decimal } from 'decimal.js';

/** Entrada aceita em qualquer helper: já-Decimal, número, string ou nulo. */
export type NumericInput = Decimal | number | string | null | undefined;

export const MONEY_DP = 2;
export const QTY_DP = 3;

// HALF_UP: 2,675 -> 2,68. O Python usava banker's rounding (2,67), o que
// surpreende usuário e não é o padrão fiscal brasileiro.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 30 });

/** Converte qualquer entrada para Decimal, tratando nulo/NaN como zero. */
export function dec(value: NumericInput): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  if (value instanceof Decimal) return value;
  try {
    const d = new Decimal(value as Decimal.Value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

/** Arredonda para 2 casas (dinheiro). */
export function money(value: NumericInput): Decimal {
  return dec(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

/** Arredonda para 3 casas (quantidade). */
export function qty(value: NumericInput): Decimal {
  return dec(value).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
}

/** Soma uma lista já arredondando o resultado como dinheiro. */
export function sumMoney(values: NumericInput[]): Decimal {
  return money(values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0)));
}

/** Aplica um percentual (ex.: 5 = 5%) sobre um valor monetário. */
export function percentOf(value: NumericInput, percent: NumericInput): Decimal {
  return money(dec(value).times(dec(percent)).dividedBy(100));
}

/** Nunca deixa o valor ficar abaixo de zero. */
export function notNegative(value: NumericInput): Decimal {
  const d = dec(value);
  return d.isNegative() ? new Decimal(0) : d;
}

export function isZero(value: NumericInput): boolean {
  return dec(value).isZero();
}

export function gt(a: NumericInput, b: NumericInput): boolean {
  return dec(a).greaterThan(dec(b));
}

export function gte(a: NumericInput, b: NumericInput): boolean {
  return dec(a).greaterThanOrEqualTo(dec(b));
}

export function lte(a: NumericInput, b: NumericInput): boolean {
  return dec(a).lessThanOrEqualTo(dec(b));
}

/**
 * Serialização para a API.
 *
 * Devolve `number`, e não string, porque todo o front atual faz
 * `valor.toLocaleString('pt-BR')` e comparações numéricas. Valores de ERP de
 * padaria ficam muito abaixo do limite seguro de `Number` (9 quatrilhões), e
 * a precisão já foi garantida no cálculo e na coluna Decimal do banco — aqui é
 * só transporte.
 */
export function toNumber(value: NumericInput): number {
  return dec(value).toNumber();
}

/** Formata para exibição em real, quando o servidor precisa gerar texto (PDF). */
export function formatBRL(value: NumericInput): string {
  return money(value).toNumber().toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

export { Decimal };
