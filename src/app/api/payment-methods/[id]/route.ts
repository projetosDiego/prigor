import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { paymentOptionUpdateSchema } from '@/server/validation/sales';
import { deletePaymentOption, updatePaymentOption } from '@/server/services/payment-options';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route<Context>('formas_pagamento.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = paymentOptionUpdateSchema.parse(await readJson(request));
  return ok(await updatePaymentOption(id, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('formas_pagamento.desativar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deletePaymentOption(id);
  return ok({ ok: true });
});
