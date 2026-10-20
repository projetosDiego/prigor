import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { openBalancesByCustomer } from '@/server/services/open-balances';

/** Títulos em aberto e crédito por cliente (vendedor vê só os dos próprios pedidos). */
export const GET = route('clientes.em_aberto', async () => {
  const session = await requireUser();
  return ok(await openBalancesByCustomer(session));
});
