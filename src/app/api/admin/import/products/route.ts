import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, ProductType } from '@prisma/client';
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

      const getNum = (possibleKeys: string[]): number => {
        const val = getVal(possibleKeys);
        if (!val) return 0;
        const parsed = parseFloat(val.replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
      };

      const barCode = getVal(['Código de Barras', 'Código de barras', 'codigo_barras', 'barCode', 'barcode']);
      const internalCode = getVal(['Código Interno', 'Código interno', 'codigo_interno', 'sku', 'SKU', 'Sku']);
      const name = getVal(['Descrição', 'Descricao', 'descrição', 'nome', 'Nome', 'name', 'NAME']);
      const tipo = getVal(['Tipo de Produto', 'tipo', 'Tipo', 'type']);
      const precoCusto = getNum(['Preço de Custo', 'Preco de Custo', 'preço de custo', 'preco_custo', 'cost', 'COST']);
      const precoVarejo = getNum(['Preço Venda Varejo', 'Preco Venda Varejo', 'preco_varejo', 'salePrice', 'sale_price']);
      const precoAtacado = getNum(['Preço Venda Atacado', 'Preco Venda Atacado', 'preco_atacado', 'wholesalePrice', 'wholesale_price']);
      const minAtacado = getNum(['Quantidade Mínima Atacado', 'qtd_min_atacado', 'minWholesaleQty']);
      const unidade = getVal(['Unidade', 'unidade', 'unit', 'UNIT']) || 'un';
      const ativoRaw = getVal(['Ativo', 'ativo', 'active', 'ACTIVE']);
      const categoria = getVal(['Categoria do Produto', 'Categoria', 'categoria', 'category']);
      const movimentaEstoqueRaw = getVal(['Movimenta Estoque', 'movimenta_estoque', 'trackStock']);
      const estoqueMinimo = getNum(['Estoque mínimo', 'Estoque minimo', 'estoque_minimo', 'minStock']);
      const estoqueAtual = getNum(['Quantidade em Estoque', 'estoque', 'stock']);
      const tags = getVal(['Tags', 'tags']);
      const precoDe = getNum(['Preço De', 'preco_de', 'priceFrom']);
      const precoPor = getNum(['Preço Por', 'preco_por', 'priceTo']);
      const altura = getNum(['Altura (cm)', 'altura']);
      const largura = getNum(['Largura (cm)', 'largura']);
      const profundidade = getNum(['Profundidade (cm)', 'profundidade']);
      const peso = getNum(['Peso (Kg)', 'peso']);
      const descCompleta = getVal(['Descrição do Produto', 'Especificações', 'Garantia']);

      if (!name) {
        skipped++;
        continue;
      }

      const active = ativoRaw.toLowerCase() === 'sim' || ativoRaw.toLowerCase() === 's' || ativoRaw.toLowerCase() === 'true' || ativoRaw === '';
      const trackStock = movimentaEstoqueRaw.toLowerCase() === 'sim' || movimentaEstoqueRaw.toLowerCase() === 's' || movimentaEstoqueRaw.toLowerCase() === 'true';

      const isInsumo = tipo.toLowerCase().includes('insumo') || categoria.toLowerCase().includes('insumo');

      const productData = {
        sku: internalCode || barCode || `PROD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        barCode: barCode || null,
        internalCode: internalCode || null,
        name,
        storeName: name,
        description: descCompleta || null,
        category: categoria || 'Geral',
        type: isInsumo ? ProductType.insumo : ProductType.venda,
        unit: unidade,
        salePrice: precoVarejo,
        wholesalePrice: precoAtacado || precoVarejo,
        minWholesaleQty: minAtacado,
        priceFrom: precoDe || precoVarejo,
        priceTo: precoPor || precoVarejo,
        cost: precoCusto,
        stock: estoqueAtual,
        minStock: estoqueMinimo,
        trackStock,
        weightKg: peso,
        heightCm: altura,
        widthCm: largura,
        depthCm: profundidade,
        tags: tags || null,
        active
      };

      // Tenta achar por SKU/código interno
      let existing = null;
      if (internalCode) {
        existing = await prisma.product.findUnique({
          where: { sku: internalCode }
        });
      }

      if (!existing && barCode) {
        existing = await prisma.product.findFirst({
          where: { barCode }
        });
      }

      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: productData
        });
        updated++;
      } else {
        await prisma.product.create({
          data: productData
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
    console.error('[Import Products Error]:', err.message);
    return NextResponse.json({ error: 'Erro ao processar e salvar planilha de produtos: ' + err.message }, { status: 500 });
  }
}
