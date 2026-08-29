/**
 * Importação de produtos por planilha (.xlsx).
 *
 * Mesmos defeitos da importação de clientes, corrigidos aqui: cliente Prisma
 * próprio, uma a duas consultas por linha para localizar o produto existente,
 * escrita fora de transação e mensagem de exceção repassada ao cliente.
 *
 * O SKU sintético `PROD-<timestamp>-<aleatório>` que a versão anterior gerava
 * para produto sem código saiu: gerava uma chave nova a cada importação, então
 * o mesmo produto entrava de novo toda vez. Sem código, o produto é criado com
 * SKU nulo.
 */
import * as XLSX from 'xlsx';

import { requireAdmin } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { badRequest } from '@/server/http/errors';
import { logger } from '@/server/http/logger';
import { ok, route } from '@/server/http/respond';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  importedProductSchema,
  type ImportIssue,
  type ImportedProduct,
} from '@/server/validation/crm';
import type { Tx } from '@/server/tx';

type SheetRow = Record<string, unknown>;

function pick(row: SheetRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return '';
}

/**
 * Número da planilha: vazio vira zero e as duas notações do arquivo do ERP são
 * aceitas. Havendo vírgula, ela é o separador decimal e o ponto é milhar
 * ("1.234,56"); sem vírgula, o ponto já é o decimal ("1234.56").
 */
function pickNumber(row: SheetRow, keys: string[]): number {
  const raw = pick(row, keys);
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "Sim"/"S"/"true" ligam a flag; vazio usa o padrão informado. */
function pickFlag(row: SheetRow, keys: string[], whenBlank: boolean): boolean {
  const raw = pick(row, keys).toLowerCase();
  if (raw === '') return whenBlank;
  return raw === 'sim' || raw === 's' || raw === 'true' || raw === '1';
}

const COLUMNS = {
  barCode: ['Código de Barras', 'Código de barras', 'codigo_barras', 'barCode', 'barcode'],
  internalCode: ['Código Interno', 'Código interno', 'codigo_interno', 'sku', 'SKU', 'Sku'],
  name: ['Descrição', 'Descricao', 'descrição', 'nome', 'Nome', 'name', 'NAME'],
  type: ['Tipo de Produto', 'tipo', 'Tipo', 'type'],
  cost: ['Preço de Custo', 'Preco de Custo', 'preço de custo', 'preco_custo', 'cost', 'COST'],
  salePrice: ['Preço Venda Varejo', 'Preco Venda Varejo', 'preco_varejo', 'salePrice', 'sale_price'],
  wholesalePrice: ['Preço Venda Atacado', 'Preco Venda Atacado', 'preco_atacado', 'wholesalePrice', 'wholesale_price'],
  minWholesaleQty: ['Quantidade Mínima Atacado', 'qtd_min_atacado', 'minWholesaleQty'],
  unit: ['Unidade', 'unidade', 'unit', 'UNIT'],
  active: ['Ativo', 'ativo', 'active', 'ACTIVE'],
  category: ['Categoria do Produto', 'Categoria', 'categoria', 'category'],
  trackStock: ['Movimenta Estoque', 'movimenta_estoque', 'trackStock'],
  minStock: ['Estoque mínimo', 'Estoque minimo', 'estoque_minimo', 'minStock'],
  stock: ['Quantidade em Estoque', 'estoque', 'stock'],
  tags: ['Tags', 'tags'],
  priceFrom: ['Preço De', 'preco_de', 'priceFrom'],
  priceTo: ['Preço Por', 'preco_por', 'priceTo'],
  heightCm: ['Altura (cm)', 'altura'],
  widthCm: ['Largura (cm)', 'largura'],
  depthCm: ['Profundidade (cm)', 'profundidade'],
  weightKg: ['Peso (Kg)', 'peso'],
  description: ['Descrição do Produto', 'Especificações', 'Garantia'],
};

function readSheet(bytes: ArrayBuffer): SheetRow[] {
  const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw badRequest('A planilha não tem nenhuma aba.');
  return XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName]);
}

async function readUploadedSheet(request: Request): Promise<SheetRow[]> {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) throw badRequest('Nenhum arquivo enviado.');
  if (file.size === 0) throw badRequest('O arquivo enviado está vazio.');
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw badRequest(
      `Arquivo grande demais. O limite é de ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const rows = readSheet(await file.arrayBuffer());
  if (rows.length === 0) throw badRequest('Planilha vazia ou sem linhas de dados.');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw badRequest(`Importe no máximo ${MAX_IMPORT_ROWS} linhas por vez.`);
  }
  return rows;
}

export const POST = route('admin.importar-produtos', async (request) => {
  const session = await requireAdmin();
  const rows = await readUploadedSheet(request);

  const erros: ImportIssue[] = [];
  const parsed: ImportedProduct[] = [];

  rows.forEach((row, index) => {
    const type = pick(row, COLUMNS.type).toLowerCase();
    const category = pick(row, COLUMNS.category);
    const salePrice = pickNumber(row, COLUMNS.salePrice);
    const wholesalePrice = pickNumber(row, COLUMNS.wholesalePrice);
    const priceFrom = pickNumber(row, COLUMNS.priceFrom);
    const priceTo = pickNumber(row, COLUMNS.priceTo);

    const candidate = {
      name: pick(row, COLUMNS.name),
      barCode: pick(row, COLUMNS.barCode),
      internalCode: pick(row, COLUMNS.internalCode),
      description: pick(row, COLUMNS.description),
      category: category || 'Geral',
      type:
        type.includes('insumo') || category.toLowerCase().includes('insumo')
          ? 'insumo'
          : 'venda',
      unit: pick(row, COLUMNS.unit) || 'un',
      tags: pick(row, COLUMNS.tags),

      salePrice,
      wholesalePrice: wholesalePrice || salePrice,
      priceFrom: priceFrom || salePrice,
      priceTo: priceTo || salePrice,
      cost: pickNumber(row, COLUMNS.cost),

      minWholesaleQty: pickNumber(row, COLUMNS.minWholesaleQty),
      stock: pickNumber(row, COLUMNS.stock),
      minStock: pickNumber(row, COLUMNS.minStock),
      weightKg: pickNumber(row, COLUMNS.weightKg),
      heightCm: pickNumber(row, COLUMNS.heightCm),
      widthCm: pickNumber(row, COLUMNS.widthCm),
      depthCm: pickNumber(row, COLUMNS.depthCm),

      trackStock: pickFlag(row, COLUMNS.trackStock, false),
      // Coluna "Ativo" em branco significa ativo, como na versão anterior.
      active: pickFlag(row, COLUMNS.active, true),
    };

    const result = importedProductSchema.safeParse(candidate);
    if (!result.success) {
      const first = result.error.issues[0];
      erros.push({
        linha: index + 2,
        motivo: first ? `${first.path.join('.') || 'linha'}: ${first.message}` : 'Linha inválida.',
      });
      return;
    }
    parsed.push(result.data);
  });

  // Produtos já existentes resolvidos em duas consultas, não em duas por linha.
  const skus = parsed
    .map((row) => row.internalCode)
    .filter((code): code is string => Boolean(code));
  const barCodes = parsed
    .map((row) => row.barCode)
    .filter((code): code is string => Boolean(code));

  const [bySkuRows, byBarCodeRows] = await Promise.all([
    skus.length
      ? prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } })
      : Promise.resolve([]),
    barCodes.length
      ? prisma.product.findMany({
          where: { barCode: { in: barCodes } },
          select: { id: true, barCode: true },
        })
      : Promise.resolve([]),
  ]);

  const idBySku = new Map<string, string>(
    (bySkuRows as Array<{ id: string; sku: string | null }>)
      .filter((row): row is { id: string; sku: string } => row.sku !== null)
      .map((row) => [row.sku, row.id]),
  );
  const idByBarCode = new Map<string, string>(
    (byBarCodeRows as Array<{ id: string; barCode: string | null }>)
      .filter((row): row is { id: string; barCode: string } => row.barCode !== null)
      .map((row) => [row.barCode, row.id]),
  );

  function toPersistable(row: ImportedProduct) {
    return {
      sku: row.internalCode ?? row.barCode,
      barCode: row.barCode,
      internalCode: row.internalCode,
      name: row.name,
      storeName: row.name,
      description: row.description,
      category: row.category,
      type: row.type,
      unit: row.unit,
      salePrice: row.salePrice,
      wholesalePrice: row.wholesalePrice,
      minWholesaleQty: row.minWholesaleQty,
      priceFrom: row.priceFrom,
      priceTo: row.priceTo,
      cost: row.cost,
      stock: row.stock,
      minStock: row.minStock,
      trackStock: row.trackStock,
      weightKg: row.weightKg,
      heightCm: row.heightCm,
      widthCm: row.widthCm,
      depthCm: row.depthCm,
      tags: row.tags,
      active: row.active,
    };
  }

  const seenId = new Set<string>();
  // O mesmo código repetido no arquivo não pode virar duas linhas novas: o SKU
  // é único e o `createMany` estouraria a restrição no meio da transação.
  const seenNewSku = new Set<string>();
  const toCreate: ReturnType<typeof toPersistable>[] = [];
  const toUpdate: Array<{ id: string; data: ReturnType<typeof toPersistable> }> = [];

  for (const row of parsed) {
    const data = toPersistable(row);
    const id =
      (row.internalCode ? idBySku.get(row.internalCode) : undefined) ??
      (row.barCode ? idByBarCode.get(row.barCode) : undefined);

    if (id) {
      // Linha repetida do mesmo produto: vale a primeira, sem gravar duas vezes.
      if (seenId.has(id)) continue;
      seenId.add(id);
      toUpdate.push({ id, data });
      continue;
    }

    if (data.sku) {
      if (seenNewSku.has(data.sku)) continue;
      seenNewSku.add(data.sku);
    }
    toCreate.push(data);
  }

  await prisma.$transaction(async (tx: Tx) => {
    if (toCreate.length > 0) await tx.product.createMany({ data: toCreate });
    for (const item of toUpdate) {
      await tx.product.update({ where: { id: item.id }, data: item.data });
    }
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'IMPORT_PRODUCTS_XLSX',
        entity: 'Product',
        newValue: { criados: toCreate.length, atualizados: toUpdate.length, ignorados: erros.length },
      },
    });
  });

  logger.info('planilha de produtos importada', {
    route: 'admin.importar-produtos',
    userId: session.userId,
    criados: toCreate.length,
    atualizados: toUpdate.length,
    ignorados: erros.length,
  });

  return ok({
    success: true,
    criados: toCreate.length,
    atualizados: toUpdate.length,
    ignorados: erros.length,
    erros,
    // Aliases de compatibilidade com a tela de importação.
    totalProcessed: rows.length,
    inserted: toCreate.length,
    updated: toUpdate.length,
    skipped: erros.length,
  });
});
