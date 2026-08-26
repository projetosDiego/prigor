/**
 * Leads: listagem e cadastro manual.
 *
 * A listagem antes devolvia a base inteira sem paginar. O escopo por vendedor
 * agora vem de `sellerScope()`, não de um `if` local — vendedor sem cadastro
 * vinculado passa a não enxergar nada, em vez de cair num caminho especial.
 */
import { isManagement, requireUser, sellerScope } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { conflict } from '@/server/http/errors';
import { created, ok, readJson, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import { leadCreateSchema, leadListQuerySchema } from '@/server/validation/crm';

/** Centro do Rio: usado quando o cadastro manual não traz coordenada. */
const DEFAULT_LATITUDE = -22.9068;
const DEFAULT_LONGITUDE = -43.1729;

const LEAD_INCLUDE = {
  seller: { select: { id: true, name: true } },
  region: { select: { id: true, name: true } },
  neighborhoodRel: { select: { id: true, name: true } },
  convertedCustomer: { select: { id: true, tradeName: true } },
} as const;

export const GET = route('leads.listar', async (request) => {
  const session = await requireUser();
  const query = parseQuery(request, leadListQuerySchema);

  const where: Record<string, unknown> = {
    // Vendedor só enxerga a própria carteira; gestão enxerga tudo.
    ...sellerScope(session),
    ...(query.regionId ? { regionId: query.regionId } : {}),
    ...(query.neighborhoodId ? { neighborhoodId: query.neighborhoodId } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.pipelineStage ? { pipelineStage: query.pipelineStage } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  // O filtro por vendedor da query só existe para gestão — para o vendedor ele
  // seria uma forma de olhar a carteira alheia.
  if (isManagement(session) && query.sellerId !== undefined) {
    where.sellerId = query.sellerId;
  }

  if (query.q) {
    where.OR = [
      { tradeName: { contains: query.q, mode: 'insensitive' } },
      { address: { contains: query.q, mode: 'insensitive' } },
      { phone: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      include: LEAD_INCLUDE,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return ok({
    ...paginated(rows, total, query.page, query.pageSize),
  });
});

export const POST = route('leads.criar', async (request) => {
  const session = await requireUser();
  const input = leadCreateSchema.parse(await readJson(request));

  if (input.cnpj) {
    const [leadWithCnpj, customerWithCnpj] = await Promise.all([
      prisma.lead.findUnique({ where: { cnpj: input.cnpj }, select: { id: true } }),
      prisma.customer.findUnique({ where: { cnpj: input.cnpj }, select: { id: true } }),
    ]);
    if (leadWithCnpj || customerWithCnpj) {
      throw conflict('CNPJ já cadastrado no sistema.');
    }
  }

  // Território correspondente, para atribuição automática do vendedor.
  const matched = await prisma.neighborhood.findFirst({
    where: {
      name: { equals: input.neighborhood, mode: 'insensitive' },
      city: { equals: input.city, mode: 'insensitive' },
    },
    select: { id: true, regionId: true, sellerId: true },
  });

  // Vendedor que cadastra à mão fica dono do lead; gestão respeita o território.
  const ownerSellerId = isManagement(session)
    ? (matched?.sellerId ?? null)
    : session.sellerId;

  const lead = await prisma.lead.create({
    data: {
      tradeName: input.tradeName,
      legalName: input.legalName,
      cnpj: input.cnpj,
      phone: input.phone,
      mobile: input.mobile,
      email: input.email,
      address: input.address,
      number: input.number,
      complement: input.complement,
      neighborhood: input.neighborhood,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      latitude: input.latitude ?? DEFAULT_LATITUDE,
      longitude: input.longitude ?? DEFAULT_LONGITUDE,
      category: input.category.toLowerCase(),
      sellerId: ownerSellerId,
      regionId: matched?.regionId ?? null,
      neighborhoodId: matched?.id ?? null,
      pipelineStage: 'NOVO',
      source: 'MANUAL',
      priority: input.priority,
      status: ownerSellerId ? 'ATIVO' : 'SEM_TERRITORIO',
      score: 50,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'CREATE_LEAD_MANUAL',
      entity: 'Lead',
      entityId: lead.id,
      newValue: lead,
    },
  });

  return created({ success: true, lead });
});
