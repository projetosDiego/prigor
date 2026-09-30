import { getSellerByCode } from '@/server/services/sellers';
import { ok, route } from '@/server/http/respond';

export const GET = route('public.sellers.verify', async (request) => {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get('code') || '').trim();

  if (!code) {
    return ok({ valid: false, seller: null });
  }

  const seller = await getSellerByCode(code);
  if (!seller) {
    return ok({ valid: false, seller: null });
  }

  return ok({
    valid: true,
    seller: {
      id: seller.id,
      name: seller.name,
      code: seller.code,
    },
  });
});
