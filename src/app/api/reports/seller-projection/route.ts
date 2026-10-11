import { requireUser, isManagement } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { sellerProjection } from '@/server/services/seller-projection';

/** Gestão vê todos os vendedores; vendedor vê só a própria projeção. */
export const GET = route('relatorios.projecao_vendedores', async () => {
  const session = await requireUser();
  if (isManagement(session)) return ok(await sellerProjection());
  return ok(await sellerProjection({ sellerId: session.sellerId ?? '__sem_vendedor__' }));
});
