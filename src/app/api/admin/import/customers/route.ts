import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Planilha vazia ou sem linhas de dados.' }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      // Normalização de chaves insensível a maiúsculas/acentos
      const getVal = (possibleKeys: string[]): string => {
        for (const k of possibleKeys) {
          if (row[k] !== undefined && row[k] !== null) {
            return String(row[k]).trim();
          }
        }
        return '';
      };

      const rawCnpj = getVal(['CNPJ', 'cnpj', 'Cnpj', 'C.N.P.J', 'C.N.P.J.']);
      const rawCpf = getVal(['CPF', 'cpf', 'Cpf', 'C.P.F', 'C.P.F.']);
      const nomeFantasia = getVal(['Apelido/Nome fantasia', 'Apelido', 'Apelido/Nome Fantasia', 'NOME FANTASIA', 'Nome Fantasia', 'nome fantasia', 'apelido', 'TRADE NAME', 'tradeName', 'NOME', 'Nome', 'nome']);
      const razaoSocial = getVal(['Nome/Razão Social', 'Nome/Razao Social', 'Razão Social', 'Razao Social', 'RAZÃO SOCIAL', 'razão social', 'razao social', 'LEGAL NAME', 'legalName']);
      const telefone = getVal(['Telefone', 'TELEFONE', 'telefone', 'Celular', 'celular', 'Contato', 'contato', 'PHONE', 'phone']);
      const endereco = getVal(['Endereço', 'Endereço de Entrega', 'ENDEREÇO', 'endereço', 'endereco', 'Rua', 'rua', 'Logradouro', 'logradouro', 'ADDRESS', 'address']);
      const numero = getVal(['Número', 'NÚMERO', 'número', 'numero', 'Num', 'num', 'Nº', 'nº', 'NUMBER', 'number']);
      const complemento = getVal(['Complemento', 'COMPLEMENTO', 'complemento', 'Ponto de Referência', 'ponto de referência', 'COMPLEMENT', 'complement']);
      const bairro = getVal(['Bairro', 'BAIRRO', 'bairro', 'NEIGHBORHOOD', 'neighborhood']);
      const cep = getVal(['CEP', 'Cep', 'cep', 'ZIP CODE', 'zipCode']).replace(/\D/g, '');
      const perfilComercial = getVal(['Tipo (Lista de Preços)', 'PERFIL', 'Perfil', 'perfil', 'TIPO', 'Tipo', 'tipo']);

      const finalTradeName = nomeFantasia || razaoSocial || 'Cliente Importado';

      if (!finalTradeName) {
        skipped++;
        continue;
      }

      const cleanCnpj = rawCnpj.replace(/\D/g, '');
      const cleanCpf = rawCpf.replace(/\D/g, '');

      const isRev = perfilComercial.toLowerCase().includes('revend') || perfilComercial.toLowerCase().includes('atac') || true;

      // Monta dados do cliente
      const customerData = {
        tradeName: finalTradeName,
        legalName: razaoSocial || finalTradeName,
        cnpj: cleanCnpj || null,
        cpf: cleanCpf || null,
        phone: telefone || null,
        address: endereco || 'Sem endereço informado',
        number: numero || 'S/N',
        complement: complemento || null,
        neighborhood: bairro || 'Centro',
        city: 'Rio de Janeiro',
        state: 'RJ',
        zipCode: cep || null,
        latitude: -22.9068, // Fábrica default
        longitude: -43.1729,
        category: isRev ? 'REVENDEDOR' : 'CONSUMIDOR',
        isRevendedor: isRev,
        active: true,
        status: 'ATIVO'
      };

      // Tenta achar por CNPJ
      if (cleanCnpj) {
        const existing = await prisma.customer.findUnique({
          where: { cnpj: cleanCnpj }
        });

        if (existing) {
          await prisma.customer.update({
            where: { id: existing.id },
            data: customerData
          });
          updated++;
        } else {
          await prisma.customer.create({
            data: customerData
          });
          inserted++;
        }
      } else {
        // Se não tiver CNPJ, tenta cadastrar novo com base no nome e endereço
        await prisma.customer.create({
          data: customerData
        });
        inserted++;
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessed: rows.length,
      inserted,
      updated,
      skipped
    });
  } catch (err: any) {
    console.error('[Import Customers Error]:', err.message);
    return NextResponse.json({ error: 'Erro ao processar e salvar planilha de clientes: ' + err.message }, { status: 500 });
  }
}
