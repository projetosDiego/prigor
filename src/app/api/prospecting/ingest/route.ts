/**
 * Recebe os estabelecimentos que o Claude encontrou na web e os grava como
 * leads (com deduplicação, score e distribuição territorial).
 *
 * Aceita POST (JSON) e também GET (query params) — o GET é usado pelo robô
 * diário via navegador embutido, que consegue navegar para uma URL mas não
 * executa fetch/POST de forma confiável. No GET, `places` vem como JSON
 * codificado na querystring.
 */
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { badRequest, isAppError } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { ingestWebLeads } from '@/lib/web-prospecting';

const placeSchema = z.object({
  tradeName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(255).optional(),
  number: z.string().trim().max(20).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(255).optional(),
  zipCode: z.string().trim().max(20).optional(),
});

const ingestSchema = z
  .object({
    neighborhoodId: z.string().uuid('Bairro inválido.').optional(),
    neighborhoodName: z.string().trim().min(1).max(120).optional(),
    regionName: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(2).optional(),
    category: z.string().trim().min(1).max(120),
    source: z.string().trim().max(40).optional(),
    places: z.array(placeSchema).max(100),
  })
  .refine((v) => Boolean(v.neighborhoodId || v.neighborhoodName), {
    message: 'Informe neighborhoodId ou neighborhoodName.',
  });

type IngestInput = z.infer<typeof ingestSchema>;

async function runIngest(input: IngestInput) {
  try {
    const stats = await ingestWebLeads({
      neighborhoodId: input.neighborhoodId,
      neighborhoodName: input.neighborhoodName,
      regionName: input.regionName,
      city: input.city,
      state: input.state,
      category: input.category,
      places: input.places,
      source: input.source ?? 'AUTOMATIC',
    });
    return ok({
      success: true,
      message: `Prospecção web: ${stats.newLeads} novos leads, ${stats.duplicates} duplicados, ${stats.existingCustomers} já clientes.`,
      stats,
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    throw badRequest(error instanceof Error ? error.message : 'Não foi possível gravar os leads.');
  }
}

export const POST = route('prospeccao.ingerir', async (request) => {
  await requireManager();
  const input = ingestSchema.parse(await readJson(request));
  return runIngest(input);
});

export const GET = route('prospeccao.ingerir.get', async (request) => {
  await requireManager();
  const sp = new URL(request.url).searchParams;
  let places: unknown = [];
  const rawPlaces = sp.get('places');
  if (rawPlaces) {
    try {
      places = JSON.parse(rawPlaces);
    } catch {
      throw badRequest('Parâmetro "places" precisa ser um JSON válido.');
    }
  }
  const input = ingestSchema.parse({
    neighborhoodId: sp.get('neighborhoodId') ?? undefined,
    neighborhoodName: sp.get('neighborhoodName') ?? undefined,
    regionName: sp.get('regionName') ?? undefined,
    city: sp.get('city') ?? undefined,
    state: sp.get('state') ?? undefined,
    category: sp.get('category') ?? undefined,
    source: sp.get('source') ?? undefined,
    places,
  });
  return runIngest(input);
});
