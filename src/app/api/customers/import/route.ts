import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

interface ImportRow {
  tradeName: string;
  legalName?: string;
  cnpj?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode?: string;
  latitude?: string | number;
  longitude?: string | number;
  category: string;
  notes?: string;
  googlePlaceId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, rows } = body as { action: 'preview' | 'commit'; rows: ImportRow[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha enviada para importação.' }, { status: 400 });
    }

    if (action === 'preview') {
      const results = [];
      let duplicates = 0;
      let conflicts = 0;
      let valid = 0;

      // Buscar todos os CNPJs e Place IDs existentes para otimizar a checagem
      const existingCnpjs = new Set(
        (await prisma.customer.findMany({ where: { cnpj: { not: null } }, select: { cnpj: true } }))
          .map((c) => c.cnpj)
      );

      const existingPlaceIds = new Set(
        (await prisma.customer.findMany({ where: { googlePlaceId: { not: null } }, select: { googlePlaceId: true } }))
          .map((c) => c.googlePlaceId)
      );

      const existingNameAddress = new Set(
        (await prisma.customer.findMany({ select: { tradeName: true, address: true } }))
          .map((c) => `${c.tradeName.toLowerCase()}|${c.address.toLowerCase()}`)
      );

      for (const row of rows) {
        let status = 'VALID';
        let message = 'Pronto para importar.';

        // Validação de campos obrigatórios
        if (!row.tradeName || !row.address || !row.neighborhood || !row.category) {
          status = 'INVALID';
          message = 'Campos obrigatórios ausentes (Nome Fantasia, Endereço, Bairro e Categoria).';
        } else {
          const matchKey = `${row.tradeName.toLowerCase()}|${row.address.toLowerCase()}`;
          
          if (row.googlePlaceId && existingPlaceIds.has(row.googlePlaceId)) {
            status = 'DUPLICATE';
            message = 'Estabelecimento já existe no banco (Google Place ID duplicado).';
            duplicates++;
          } else if (row.cnpj && existingCnpjs.has(row.cnpj)) {
            status = 'CONFLICT';
            message = 'Conflito de CNPJ (outro cliente já possui este CNPJ).';
            conflicts++;
          } else if (existingNameAddress.has(matchKey)) {
            status = 'DUPLICATE';
            message = 'Nome Fantasia e Endereço já existem no banco.';
            duplicates++;
          } else {
            valid++;
          }
        }

        results.push({
          row,
          status,
          message,
        });
      }

      return NextResponse.json({
        success: true,
        summary: {
          total: rows.length,
          valid,
          duplicates,
          conflicts,
          invalid: rows.length - (valid + duplicates + conflicts),
        },
        preview: results,
      });
    }

    if (action === 'commit') {
      let importedCount = 0;
      let skippedCount = 0;

      // Buscar todos os bairros para mapeamento geográfico/territorial automático
      const dbNeighborhoods = await prisma.neighborhood.findMany({
        include: { region: true },
      });

      // Mapeamento por nome de bairro
      const neighborhoodMap = new Map();
      for (const n of dbNeighborhoods) {
        neighborhoodMap.set(n.name.toLowerCase().trim(), n);
      }

      // Transação para importar em lote
      await prisma.$transaction(async (tx) => {
        for (const row of rows) {
          // Checar duplicatas de última hora
          const dupCheck = await tx.customer.findFirst({
            where: {
              OR: [
                row.googlePlaceId ? { googlePlaceId: row.googlePlaceId } : {},
                row.cnpj ? { cnpj: row.cnpj } : {},
                {
                  AND: [
                    { tradeName: { equals: row.tradeName, mode: 'insensitive' } },
                    { address: { equals: row.address, mode: 'insensitive' } },
                  ],
                },
              ],
            },
          });

          if (dupCheck) {
            skippedCount++;
            continue;
          }

          // Localizar bairro no banco
          const cleanNeighborhoodName = row.neighborhood.toLowerCase().trim();
          const matchedNeighborhood = neighborhoodMap.get(cleanNeighborhoodName);

          const lat = row.latitude ? parseFloat(String(row.latitude)) : -22.9068; // centro do RJ como default
          const lng = row.longitude ? parseFloat(String(row.longitude)) : -43.1729;

          await tx.customer.create({
            data: {
              tradeName: row.tradeName,
              legalName: row.legalName || null,
              cnpj: row.cnpj || null,
              phone: row.phone || null,
              mobile: row.mobile || null,
              email: row.email || null,
              address: row.address,
              number: row.number || null,
              complement: row.complement || null,
              neighborhood: row.neighborhood,
              city: row.city || 'Rio de Janeiro',
              state: row.state || 'RJ',
              zipCode: row.zipCode || null,
              latitude: lat,
              longitude: lng,
              category: row.category.toLowerCase(),
              notes: row.notes || null,
              googlePlaceId: row.googlePlaceId || null,
              status: 'ATIVO',
              // Atribuição territorial automática
              neighborhoodId: matchedNeighborhood?.id || null,
              regionId: matchedNeighborhood?.regionId || null,
              sellerId: matchedNeighborhood?.sellerId || null,
            },
          });

          importedCount++;
        }
      });

      // Auditoria
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: 'IMPORT_CUSTOMERS',
          entity: 'Customer',
          newValue: { importedCount, skippedCount },
        },
      });

      return NextResponse.json({
        success: true,
        summary: {
          total: rows.length,
          imported: importedCount,
          skipped: skippedCount,
        },
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error importing customers:', error);
    return NextResponse.json({ error: error.message || 'Erro ao processar importação.' }, { status: 500 });
  }
}
