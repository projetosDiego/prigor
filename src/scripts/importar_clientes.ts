import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const finalPath = "C:\\Users\\igorc\\Downloads\\ListaClientes (1).xlsx";

// Helper para higienizar strings e retornar nulo se vazio
function s(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const str = String(v).trim();
  return str.length > 0 ? str : null;
}

// Limpa CNPJ/CPF mantendo apenas números
function cleanDoc(v: unknown): string | null {
  const str = s(v);
  if (!str) return null;
  return str.replace(/\D/g, '');
}

async function main() {
  console.log("🚀 Iniciando importação de clientes da planilha...");
  console.log(`Planilha de origem: ${finalPath}`);

  try {
    const workbook = XLSX.readFile(finalPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (rows.length <= 1) {
      console.error("❌ Planilha vazia ou sem linhas de dados!");
      return;
    }

    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
    const getVal = (row: unknown[], headerName: string): unknown => {
      const idx = headers.indexOf(headerName.toLowerCase());
      if (idx === -1 || idx >= row.length) return null;
      return row[idx];
    };

    let criados = 0;
    let atualizados = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row.some(c => c !== null && c !== '')) {
        continue;
      }

      const nome = s(getVal(row, "Nome/Razão Social")) || s(getVal(row, "Nome/Razao Social")) || s(getVal(row, "Nome"));
      if (!nome) {
        continue;
      }

      const apelido = s(getVal(row, "Apelido/Nome fantasia")) || s(getVal(row, "Apelido/Nome Fantasia")) || nome;
      const cnpj = cleanDoc(getVal(row, "CNPJ"));
      const cpf = cleanDoc(getVal(row, "CPF"));
      const phone = s(getVal(row, "Telefone")) || s(getVal(row, "Celular"));
      const mobile = s(getVal(row, "Celular")) || s(getVal(row, "Telefone"));
      const email = s(getVal(row, "Email"));
      
      const endereco = s(getVal(row, "Endereço")) || s(getVal(row, "Endereco")) || 'Sem endereço cadastrado';
      const numero = s(getVal(row, "Número")) || s(getVal(row, "Numero")) || '';
      const complemento = s(getVal(row, "Complemento")) || '';
      
      // Monta o endereço de forma limpa
      let finalEndereco = endereco;
      if (numero) finalEndereco += `, ${numero}`;
      if (complemento) finalEndereco += ` - ${complemento}`;

      const bairro = s(getVal(row, "Bairro")) || 'Centro';
      const cidade = s(getVal(row, "Cidade")) || 'Rio de Janeiro';
      const estado = s(getVal(row, "Estado")) || 'RJ';
      const cep = s(getVal(row, "CEP"));

      // Verifica se o cliente já existe no banco (busca por CNPJ, CPF ou Nome)
      let clienteExistente = null;
      if (cnpj) {
        clienteExistente = await prisma.customer.findUnique({
          where: { cnpj }
        });
      }

      if (clienteExistente) {
        // Atualiza cliente existente
        await prisma.customer.update({
          where: { id: clienteExistente.id },
          data: {
            tradeName: apelido,
            phone: phone || undefined,
            mobile: mobile || undefined,
            email: email || undefined,
            address: finalEndereco,
            neighborhood: bairro,
            city: cidade,
            state: estado,
            zipCode: cep || undefined,
          }
        });
        atualizados++;
      } else {
        // Cria novo cliente no banco
        await prisma.customer.create({
          data: {
            legalName: nome,
            tradeName: apelido,
            cnpj: cnpj || undefined,
            cpf: cpf || undefined,
            phone: phone || undefined,
            mobile: mobile || undefined,
            email: email || undefined,
            address: finalEndereco,
            neighborhood: bairro,
            city: cidade,
            state: estado,
            zipCode: cep || undefined,
            // Coordenadas padrão da fábrica caso não tenha geolocalização no Excel
            latitude: -22.9068,
            longitude: -43.1729,
            category: 'conveniências', // Categoria default
            isReseller: true,        // Clientes importados por padrão são revendedores
            status: 'ATIVO',
            sellerId: null,            // Fila de triagem para o admin poder mudar depois
          }
        });
        criados++;
      }
    }

    console.log(`\n🎉 Importação concluída!`);
    console.log(`- Novos clientes criados: ${criados}`);
    console.log(`- Clientes existentes atualizados: ${atualizados}`);

  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error("❌ Ocorreu um erro durante a importação:", mensagem);
  } finally {
    await prisma.$disconnect();
  }
}

main();
