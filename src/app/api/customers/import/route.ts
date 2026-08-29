/**
 * Importação de clientes a partir de um lote JSON (pré-visualização e gravação).
 *
 * Mudanças em relação à versão anterior:
 *  - restrita a administrador (era gestão) e limitada a 1000 linhas por lote;
 *  - cada linha passa por schema — antes o objeto cru ia direto para o Prisma;
 *  - a gravação não consulta o banco linha a linha: as chaves existentes são
 *    carregadas uma vez e a deduplicação é feita em memória, inclusive contra
 *    as linhas do próprio lote;
 *  - tudo grava numa transação só, e o resumo diz o que entrou e o que não.
 */
import { requireAdmin } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { ok, readJson, route } from '@/server/http/respond';
import { logger } from '@/server/http/logger';
import {
  customerImportRowSchema,
  customerImportSchema,
  type CustomerImportRow,
  type ImportIssue,
} from '@/server/validation/crm';
import type { Tx } from '@/server/tx';

/** Centro do Rio: usado quando a linha não traz coordenada. */
const DEFAULT_LATITUDE = -22.9068;
const DEFAULT_LONGITUDE = -43.1729;

interface ExistingKeys {
  cnpjs: Set<string>;
  placeIds: Set<string>;
  nameAddress: Set<string>;
}

function matchKey(tradeName: string, address: string): string {
  return `${tradeName.toLowerCase()}|${address.toLowerCase()}`;
}

async function loadExistingKeys(): Promise<ExistingKeys> {
  const rows: Array<{
    cnpj: string | null;
    googlePlaceId: string | null;
    tradeName: string;
    address: string | null;
  }> = await prisma.customer.findMany({
    select: { cnpj: true, googlePlaceId: true, tradeName: true, address: true },
  });

  const keys: ExistingKeys = {
    cnpjs: new Set<string>(),
    placeIds: new Set<string>(),
    nameAddress: new Set<string>(),
  };

  for (const row of rows) {
    if (row.cnpj) keys.cnpjs.add(row.cnpj);
    if (row.googlePlaceId) keys.placeIds.add(row.googlePlaceId);
    // `address` é coluna opcional: o código anterior chamava `.toLowerCase()`
    // direto e quebrava no primeiro cliente sem endereço.
    keys.nameAddress.add(matchKey(row.tradeName, row.address ?? ''));
  }

  return keys;
}

type RowVerdict = 'VALID' | 'DUPLICATE' | 'CONFLICT' | 'INVALID';

interface Classified {
  index: number;
  status: RowVerdict;
  message: string;
  parsed: CustomerImportRow | null;
  raw: unknown;
}

/**
 * Classifica as linhas contra o banco e contra o próprio lote.
 * `seen` acumula as chaves já aceitas, para que a mesma linha repetida duas
 * vezes no arquivo não entre duas vezes no banco.
 */
function classify(rows: unknown[], keys: ExistingKeys): Classified[] {
  const seen: ExistingKeys = {
    cnpjs: new Set<string>(),
    placeIds: new Set<string>(),
    nameAddress: new Set<string>(),
  };

  return rows.map((raw, index) => {
    const result = customerImportRowSchema.safeParse(raw);

    if (!result.success) {
      const first = result.error.issues[0];
      return {
        index,
        status: 'INVALID' as const,
        message: first
          ? `${first.path.join('.') || 'linha'}: ${first.message}`
          : 'Linha inválida.',
        parsed: null,
        raw,
      };
    }

    const row = result.data;
    const key = matchKey(row.tradeName, row.address);

    if (row.googlePlaceId && (keys.placeIds.has(row.googlePlaceId) || seen.placeIds.has(row.googlePlaceId))) {
      return {
        index,
        status: 'DUPLICATE' as const,
        message: 'Estabelecimento já existe no banco (Google Place ID duplicado).',
        parsed: row,
        raw,
      };
    }

    if (row.cnpj && (keys.cnpjs.has(row.cnpj) || seen.cnpjs.has(row.cnpj))) {
      return {
        index,
        status: 'CONFLICT' as const,
        message: 'Conflito de CNPJ (outro cliente já possui este CNPJ).',
        parsed: row,
        raw,
      };
    }

    if (keys.nameAddress.has(key) || seen.nameAddress.has(key)) {
      return {
        index,
        status: 'DUPLICATE' as const,
        message: 'Nome Fantasia e Endereço já existem no banco.',
        parsed: row,
        raw,
      };
    }

    if (row.googlePlaceId) seen.placeIds.add(row.googlePlaceId);
    if (row.cnpj) seen.cnpjs.add(row.cnpj);
    seen.nameAddress.add(key);

    return {
      index,
      status: 'VALID' as const,
      message: 'Pronto para importar.',
      parsed: row,
      raw,
    };
  });
}

export const POST = route('clientes.importar', async (request) => {
  const session = await requireAdmin();
  const input = customerImportSchema.parse(await readJson(request));

  const keys = await loadExistingKeys();
  const classified = classify(input.rows, keys);

  const counts = {
    valid: classified.filter((r) => r.status === 'VALID').length,
    duplicates: classified.filter((r) => r.status === 'DUPLICATE').length,
    conflicts: classified.filter((r) => r.status === 'CONFLICT').length,
    invalid: classified.filter((r) => r.status === 'INVALID').length,
  };

  if (input.action === 'preview') {
    return ok({
      success: true,
      summary: {
        total: input.rows.length,
        valid: counts.valid,
        duplicates: counts.duplicates,
        conflicts: counts.conflicts,
        invalid: counts.invalid,
      },
      preview: classified.map((row) => ({
        row: row.raw,
        status: row.status,
        message: row.message,
      })),
    });
  }

  // Territórios: uma consulta só, mapeada por nome de bairro.
  const dbNeighborhoods: Array<{
    id: string;
    name: string;
    regionId: string;
    sellerId: string | null;
  }> = await prisma.neighborhood.findMany({
    select: { id: true, name: true, regionId: true, sellerId: true },
  });

  const neighborhoodByName = new Map(
    dbNeighborhoods.map((n) => [n.name.toLowerCase().trim(), n]),
  );

  const erros: ImportIssue[] = classified
    .filter((row) => row.status !== 'VALID')
    .map((row) => ({ linha: row.index + 1, motivo: row.message }));

  const toCreate = classified
    .filter((row): row is Classified & { parsed: CustomerImportRow } =>
      row.status === 'VALID' && row.parsed !== null,
    )
    .map(({ parsed }) => {
      const territory = neighborhoodByName.get(parsed.neighborhood.toLowerCase().trim());
      return {
        tradeName: parsed.tradeName,
        legalName: parsed.legalName,
        cnpj: parsed.cnpj,
        phone: parsed.phone,
        mobile: parsed.mobile,
        email: parsed.email,
        address: parsed.address,
        number: parsed.number,
        complement: parsed.complement,
        neighborhood: parsed.neighborhood,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.zipCode,
        latitude: parsed.latitude ?? DEFAULT_LATITUDE,
        longitude: parsed.longitude ?? DEFAULT_LONGITUDE,
        category: parsed.category.toLowerCase(),
        notes: parsed.notes,
        googlePlaceId: parsed.googlePlaceId,
        status: 'ATIVO',
        // Atribuição territorial automática.
        neighborhoodId: territory?.id ?? null,
        regionId: territory?.regionId ?? null,
        sellerId: territory?.sellerId ?? null,
      };
    });

  await prisma.$transaction(async (tx: Tx) => {
    if (toCreate.length > 0) {
      await tx.customer.createMany({ data: toCreate });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'IMPORT_CUSTOMERS',
        entity: 'Customer',
        newValue: { criados: toCreate.length, ignorados: erros.length },
      },
    });
  });

  logger.info('importação de clientes concluída', {
    route: 'clientes.importar',
    userId: session.userId,
    criados: toCreate.length,
    ignorados: erros.length,
  });

  return ok({
    success: true,
    criados: toCreate.length,
    atualizados: 0,
    ignorados: erros.length,
    erros,
    // Aliases de compatibilidade com a tela de importação.
    summary: {
      total: input.rows.length,
      imported: toCreate.length,
      skipped: erros.length,
    },
  });
});
