import { z } from 'zod';

import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { booleanFlag, parseQuery } from '@/server/validation/common';
import { paymentOptionSchema } from '@/server/validation/sales';
import { createPaymentOption, listPaymentOptions } from '@/server/services/payment-options';

const listQuery = z.object({ activeOnly: booleanFlag(true) });

export const GET = route('formas_pagamento.listar', async (request) => {
  await requireUser();
  const { activeOnly } = parseQuery(request, listQuery);
  return ok({ data: await listPaymentOptions(activeOnly) });
});

export const POST = route('formas_pagamento.criar', async (request) => {
  await requireManager();
  const input = paymentOptionSchema.parse(await readJson(request));
  return created(await createPaymentOption(input));
});
