import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { syncLinkedProductCosts } from '@/server/services/precificacao';

/** Grava em Produtos Acabados o custo calculado nas fichas ligadas. */
export const POST = route('precificacao.sincronizar-custos', async () => {
  await requireManager();
  return ok(await syncLinkedProductCosts());
});
