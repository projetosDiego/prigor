/**
 * Importação de clientes por planilha (.xlsx).
 *
 * O que foi corrigido aqui:
 *  - abria um `new PrismaClient()` próprio a cada carregamento do módulo, em
 *    vez de usar o cliente compartilhado — pool duplicado;
 *  - gravava no campo `isRevendedor`, que não existe no schema (é `isReseller`),
 *    então a marcação de revendedor simplesmente não acontecia;
 *  - consultava o banco uma vez por linha para achar o cliente pelo CNPJ;
 *  - escrevia fora de transação: um erro no meio deixava metade da planilha
 *    importada;
 *  - devolvia a mensagem da exceção original ao cliente.
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
  importedCustomerSchema,
  type ImportIssue,
  type ImportedCustomer,
} from '@/server/validation/crm';
import type { Tx } from '@/server/tx';

/** Fábrica, usada como coordenada padrão de quem vem da planilha. */
const DEFAULT_LATITUDE = -22.9068;
const DEFAULT_LONGITUDE = -43.1729;

type SheetRow = Record<string, unknown>;

/** Lê a primeira coluna existente entre os apelidos conhecidos. */
function pick(row: SheetRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return '';
}

const COLUMNS = {
  cnpj: ['CNPJ', 'cnpj', 'Cnpj', 'C.N.P.J', 'C.N.P.J.'],
  cpf: ['CPF', 'cpf', 'Cpf', 'C.P.F', 'C.P.F.'],
  tradeName: [
    'Apelido/Nome fantasia', 'Apelido', 'Apelido/Nome Fantasia', 'NOME FANTASIA',
    'Nome Fantasia', 'nome fantasia', 'apelido', 'TRADE NAME', 'tradeName', 'NOME', 'Nome', 'nome',
  ],
  legalName: [
    'Nome/Razão Social', 'Nome/Razao Social', 'Razão Social', 'Razao Social',
    'RAZÃO SOCIAL', 'razão social', 'razao social', 'LEGAL NAME', 'legalName',
  ],
  phone: ['Telefone', 'TELEFONE', 'telefone', 'Celular', 'celular', 'Contato', 'contato', 'PHONE', 'phone'],
  address: [
    'Endereço', 'Endereço de Entrega', 'ENDEREÇO', 'endereço', 'endereco',
    'Rua', 'rua', 'Logradouro', 'logradouro', 'ADDRESS', 'address',
  ],
  number: ['Número', 'NÚMERO', 'número', 'numero', 'Num', 'num', 'Nº', 'nº', 'NUMBER', 'number'],
  complement: [
    'Complemento', 'COMPLEMENTO', 'complemento', 'Ponto de Referência',
    'ponto de referência', 'COMPLEMENT', 'complement',
  ],
  neighborhood: ['Bairro', 'BAIRRO', 'bairro', 'NEIGHBORHOOD', 'neighborhood'],
  zipCode: ['CEP', 'Cep', 'cep', 'ZIP CODE', 'zipCode'],
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

export const POST = route('admin.importar-clientes', async (request) => {
  const session = await requireAdmin();
  const rows = await readUploadedSheet(request);

  const erros: ImportIssue[] = [];
  const parsed: ImportedCustomer[] = [];

  rows.forEach((row, index) => {
    const candidate = {
      tradeName: pick(row, COLUMNS.tradeName) || pick(row, COLUMNS.legalName),
      legalName: pick(row, COLUMNS.legalName) || pick(row, COLUMNS.tradeName),
      cnpj: pick(row, COLUMNS.cnpj),
      cpf: pick(row, COLUMNS.cpf),
      phone: pick(row, COLUMNS.phone),
      address: pick(row, COLUMNS.address) || 'Sem endereço informado',
      number: pick(row, COLUMNS.number) || 'S/N',
      complement: pick(row, COLUMNS.complement),
      neighborhood: pick(row, COLUMNS.neighborhood) || 'Centro',
      zipCode: pick(row, COLUMNS.zipCode),
    };

    const result = importedCustomerSchema.safeParse(candidate);
    if (!result.success) {
      const first = result.error.issues[0];
      erros.push({
        linha: index + 2, // +1 pelo cabeçalho, +1 porque planilha conta do 1
        motivo: first ? `${first.path.join('.') || 'linha'}: ${first.message}` : 'Linha inválida.',
      });
      return;
    }
    parsed.push(result.data);
  });

  // Uma consulta resolve todos os CNPJs do lote, em vez de uma por linha.
  const cnpjs = parsed
    .map((row) => row.cnpj)
    .filter((cnpj): cnpj is string => Boolean(cnpj));

  const existing: Array<{ id: string; cnpj: string | null }> = cnpjs.length
    ? await prisma.customer.findMany({
        where: { cnpj: { in: cnpjs } },
        select: { id: true, cnpj: true },
      })
    : [];

  const idByCnpj = new Map<string, string>(
    existing
      .filter((row): row is { id: string; cnpj: string } => row.cnpj !== null)
      .map((row) => [row.cnpj, row.id]),
  );

  function toPersistable(row: ImportedCustomer) {
    return {
      tradeName: row.tradeName,
      legalName: row.legalName,
      cnpj: row.cnpj,
      cpf: row.cpf,
      phone: row.phone,
      address: row.address,
      number: row.number,
      complement: row.complement,
      neighborhood: row.neighborhood,
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: row.zipCode,
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      category: 'REVENDEDOR',
      // A coluna de perfil da planilha do ERP antigo não é confiável; todo
      // cliente importado por aqui entra como revendedor, que é o
      // comportamento efetivo da versão anterior.
      isReseller: true,
      active: true,
      status: 'ATIVO',
    };
  }

  // Duas linhas do mesmo CNPJ no arquivo: vale a última, sem gravar duas vezes.
  const seenCnpj = new Set<string>();
  const toCreate: ReturnType<typeof toPersistable>[] = [];
  const toUpdate: Array<{ id: string; data: ReturnType<typeof toPersistable> }> = [];

  for (const row of parsed) {
    const data = toPersistable(row);
    if (!row.cnpj) {
      toCreate.push(data);
      continue;
    }
    if (seenCnpj.has(row.cnpj)) continue;
    seenCnpj.add(row.cnpj);

    const id = idByCnpj.get(row.cnpj);
    if (id) toUpdate.push({ id, data });
    else toCreate.push(data);
  }

  await prisma.$transaction(async (tx: Tx) => {
    if (toCreate.length > 0) await tx.customer.createMany({ data: toCreate });
    for (const item of toUpdate) {
      await tx.customer.update({ where: { id: item.id }, data: item.data });
    }
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'IMPORT_CUSTOMERS_XLSX',
        entity: 'Customer',
        newValue: { criados: toCreate.length, atualizados: toUpdate.length, ignorados: erros.length },
      },
    });
  });

  logger.info('planilha de clientes importada', {
    route: 'admin.importar-clientes',
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
