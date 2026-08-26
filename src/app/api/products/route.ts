import { requireManager, requireUser } from '@/server/auth/guard';
import { ok, created, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { productInputSchema, productListQuerySchema } from '@/server/validation/catalog';
import { createProduct, listProducts } from '@/server/services/products';

export const GET = route('produtos.listar', async (request) => {
  await requireUser();
  const query = parseQuery(request, productListQuerySchema);

  return ok(
    await listProducts({
      type: query.type,
      search: query.search,
      activeOnly: query.activeOnly,
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
});

export const POST = route('produtos.criar', async (request) => {
  await requireManager();
  const input = productInputSchema.parse(await readJson(request));
  return created(await createProduct(input));
});
