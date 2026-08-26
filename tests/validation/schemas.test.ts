import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  booleanFlag,
  digits,
  email,
  optionalIsoDate,
  optionalText,
  optionalUuid,
} from '@/server/validation/common';
import { customerInputSchema, orderListQuerySchema } from '@/server/validation/sales';

describe('campos opcionais aceitam ausência', () => {
  it('optionalText', () => {
    expect(z.object({ a: optionalText(10) }).parse({})).toEqual({ a: null });
  });
  it('optionalUuid ausente', () => {
    expect(z.object({ a: optionalUuid('X') }).parse({})).toEqual({ a: null });
  });
  it('optionalUuid com string vazia', () => {
    expect(z.object({ a: optionalUuid('X') }).parse({ a: '' })).toEqual({ a: null });
  });
  it('booleanFlag usa o default', () => {
    expect(z.object({ a: booleanFlag(true) }).parse({})).toEqual({ a: true });
  });
  it('digits', () => {
    expect(z.object({ a: digits('X') }).parse({})).toEqual({ a: null });
  });
  it('email', () => {
    expect(z.object({ a: email() }).parse({})).toEqual({ a: null });
  });
  it('optionalIsoDate', () => {
    expect(z.object({ a: optionalIsoDate('X') }).parse({})).toEqual({ a: null });
  });
});

describe('schemas reais com entrada mínima', () => {
  it('orderListQuery aceita query vazia', () => {
    const parsed = orderListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
  });
  it('customerInput aceita só o nome', () => {
    const parsed = customerInputSchema.parse({ tradeName: 'Padaria X' });
    expect(parsed.tradeName).toBe('Padaria X');
    expect(parsed.phone).toBeNull();
    expect(parsed.isReseller).toBe(false);
  });
});
