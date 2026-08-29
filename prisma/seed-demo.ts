/**
 * Dados de demonstração para teste local.
 *
 * NÃO é o seed de produção (esse é `seed.ts`, que só cria o administrador e a
 * configuração padrão). Este aqui popula o banco com um cenário completo para
 * você conseguir clicar em todas as telas: catálogo com ficha técnica,
 * clientes, vendedor, território e pedidos em vários status.
 *
 * Recusa rodar com NODE_ENV=production.
 *
 *   npm run db:seed:demo
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production') {
  console.error('[demo] Recusado: este seed nunca deve rodar em produção.');
  process.exit(1);
}

const SENHA_DEMO = 'demo12345678';

function dias(offset: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main(): Promise<void> {
  console.log('[demo] populando cenário de teste...');

  // ─── Acesso ───────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(SENHA_DEMO, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@prigor.local' },
    update: {},
    create: {
      name: 'Administrador Demo',
      email: 'admin@prigor.local',
      passwordHash: hash,
      role: 'ADMIN',
    },
  });

  const usuarioVendedor = await prisma.user.upsert({
    where: { email: 'vendedor@prigor.local' },
    update: {},
    create: {
      name: 'João da Silva',
      email: 'vendedor@prigor.local',
      phone: '21999990001',
      passwordHash: hash,
      role: 'SELLER',
    },
  });

  const vendedor = await prisma.seller.upsert({
    where: { userId: usuarioVendedor.id },
    update: {},
    create: {
      userId: usuarioVendedor.id,
      name: 'João da Silva',
      phone: '21999990001',
      email: 'vendedor@prigor.local',
      commissionPct: '5.00',
      goal: 20,
    },
  });

  // ─── Território ───────────────────────────────────────────────────────────
  const zonaNorte = await prisma.region.upsert({
    where: { name: 'Zona Norte' },
    update: {},
    create: { name: 'Zona Norte', description: 'Tijuca, Vila Isabel e adjacências' },
  });

  const zonaSul = await prisma.region.upsert({
    where: { name: 'Zona Sul' },
    update: {},
    create: { name: 'Zona Sul', description: 'Copacabana, Botafogo, Ipanema' },
  });

  const tijuca = await prisma.neighborhood.upsert({
    where: { name_city_state: { name: 'Tijuca', city: 'Rio de Janeiro', state: 'RJ' } },
    update: {},
    create: { name: 'Tijuca', regionId: zonaNorte.id, sellerId: vendedor.id },
  });

  await prisma.neighborhood.upsert({
    where: { name_city_state: { name: 'Botafogo', city: 'Rio de Janeiro', state: 'RJ' } },
    update: {},
    create: { name: 'Botafogo', regionId: zonaSul.id, sellerId: vendedor.id },
  });

  // ─── Insumos ──────────────────────────────────────────────────────────────
  const insumos = [
    { sku: 'INS-CHOC', name: 'Chocolate meio amargo', unit: 'kg', cost: '38.00', stock: '25.000' },
    { sku: 'INS-FARI', name: 'Farinha de trigo', unit: 'kg', cost: '5.50', stock: '60.000' },
    { sku: 'INS-MANT', name: 'Manteiga sem sal', unit: 'kg', cost: '42.00', stock: '12.000' },
    { sku: 'INS-ACUC', name: 'Açúcar refinado', unit: 'kg', cost: '4.20', stock: '80.000' },
    { sku: 'INS-DOCE', name: 'Doce de leite', unit: 'kg', cost: '26.00', stock: '8.000' },
    { sku: 'INS-EMBA', name: 'Embalagem individual', unit: 'un', cost: '0.35', stock: '2000.000' },
  ];

  const insumoPorSku = new Map<string, string>();
  for (const insumo of insumos) {
    const criado = await prisma.product.upsert({
      where: { sku: insumo.sku },
      update: { cost: insumo.cost },
      create: {
        sku: insumo.sku,
        name: insumo.name,
        type: 'insumo',
        unit: insumo.unit,
        cost: insumo.cost,
        stock: insumo.stock,
        minStock: '5.000',
        category: 'Matéria-prima',
      },
    });
    insumoPorSku.set(insumo.sku, criado.id);
  }

  // ─── Produtos de venda, com ficha técnica ─────────────────────────────────
  const produtos = [
    {
      sku: 'BRW-TRAD',
      barCode: '7890000000017',
      name: 'Brownie tradicional',
      salePrice: '9.50',
      wholesalePrice: '7.20',
      minWholesaleQty: '20.000',
      commissionPct: null as string | null,
      receita: [
        ['INS-CHOC', '0.060'],
        ['INS-FARI', '0.040'],
        ['INS-MANT', '0.030'],
        ['INS-ACUC', '0.045'],
        ['INS-EMBA', '1.000'],
      ],
    },
    {
      sku: 'BRW-DOCE',
      barCode: '7890000000024',
      name: 'Brownie recheado de doce de leite',
      salePrice: '12.00',
      wholesalePrice: '9.30',
      minWholesaleQty: '20.000',
      commissionPct: '8.00',
      receita: [
        ['INS-CHOC', '0.060'],
        ['INS-FARI', '0.040'],
        ['INS-MANT', '0.030'],
        ['INS-ACUC', '0.045'],
        ['INS-DOCE', '0.035'],
        ['INS-EMBA', '1.000'],
      ],
    },
    {
      sku: 'COOK-CHOC',
      barCode: '7890000000031',
      name: 'Cookie de chocolate',
      salePrice: '7.00',
      wholesalePrice: '5.40',
      minWholesaleQty: '30.000',
      commissionPct: '0.00',
      receita: [
        ['INS-CHOC', '0.025'],
        ['INS-FARI', '0.050'],
        ['INS-MANT', '0.020'],
        ['INS-ACUC', '0.030'],
      ],
    },
  ];

  const produtoPorSku = new Map<string, string>();
  for (const produto of produtos) {
    // Custo calculado pela ficha técnica, como o serviço faria.
    const custo = produto.receita.reduce((total, [sku, qtd]) => {
      const insumo = insumos.find((i) => i.sku === sku)!;
      return total + Number(insumo.cost) * Number(qtd);
    }, 0);

    const criado = await prisma.product.upsert({
      where: { sku: produto.sku },
      update: {},
      create: {
        sku: produto.sku,
        barCode: produto.barCode,
        name: produto.name,
        type: 'venda',
        unit: 'un',
        category: 'Brownies',
        salePrice: produto.salePrice,
        wholesalePrice: produto.wholesalePrice,
        minWholesaleQty: produto.minWholesaleQty,
        cost: custo.toFixed(2),
        stock: '120.000',
        minStock: '20.000',
        commissionPct: produto.commissionPct,
      },
    });

    await prisma.recipeIngredient.deleteMany({ where: { productFinalId: criado.id } });
    await prisma.recipeIngredient.createMany({
      data: produto.receita.map(([sku, qtd]) => ({
        productFinalId: criado.id,
        ingredientId: insumoPorSku.get(sku)!,
        quantity: qtd,
      })),
    });

    produtoPorSku.set(produto.sku, criado.id);
  }

  // ─── Clientes ─────────────────────────────────────────────────────────────
  const clientes = [
    {
      tradeName: 'Padaria Imperial',
      legalName: 'Panificadora Imperial Ltda',
      cnpj: '11222333000181',
      phone: '2122223333',
      address: 'Rua Conde de Bonfim',
      number: '450',
      neighborhood: 'Tijuca',
      isReseller: true,
      latitude: -22.9245,
      longitude: -43.2336,
    },
    {
      tradeName: 'Café do Ponto',
      legalName: 'Cafeteria do Ponto ME',
      cnpj: '22333444000172',
      phone: '2133334444',
      address: 'Rua Voluntários da Pátria',
      number: '120',
      neighborhood: 'Botafogo',
      isReseller: false,
      latitude: -22.9515,
      longitude: -43.1802,
    },
    {
      tradeName: 'Lanchonete da Esquina',
      cnpj: '33444555000163',
      phone: '2144445555',
      address: 'Rua Uruguai',
      number: '77',
      neighborhood: 'Tijuca',
      isReseller: false,
      latitude: -22.9301,
      longitude: -43.2408,
    },
  ];

  const clientePorNome = new Map<string, string>();
  for (const cliente of clientes) {
    const criado = await prisma.customer.upsert({
      where: { cnpj: cliente.cnpj },
      update: {},
      create: {
        ...cliente,
        city: 'Rio de Janeiro',
        state: 'RJ',
        category: 'Padaria',
        sellerId: vendedor.id,
        regionId: zonaNorte.id,
        neighborhoodId: cliente.neighborhood === 'Tijuca' ? tijuca.id : null,
      },
    });
    clientePorNome.set(cliente.tradeName, criado.id);
  }

  // ─── Leads ────────────────────────────────────────────────────────────────
  const leads = [
    { tradeName: 'Confeitaria Bela Vista', stage: 'NOVO' as const, score: 82 },
    { tradeName: 'Açaí da Praça', stage: 'ABORDADO' as const, score: 64 },
    { tradeName: 'Restaurante Tempero Carioca', stage: 'INTERESSADO' as const, score: 71 },
  ];

  for (const [indice, lead] of leads.entries()) {
    const existente = await prisma.lead.findFirst({ where: { tradeName: lead.tradeName } });
    if (existente) continue;

    await prisma.lead.create({
      data: {
        tradeName: lead.tradeName,
        address: `Rua de Teste, ${100 + indice * 10}`,
        neighborhood: 'Tijuca',
        city: 'Rio de Janeiro',
        state: 'RJ',
        latitude: -22.925 + indice * 0.004,
        longitude: -43.234 + indice * 0.004,
        category: 'Cafeteria',
        score: lead.score,
        pipelineStage: lead.stage,
        source: 'MANUAL',
        sellerId: vendedor.id,
        regionId: zonaNorte.id,
        neighborhoodId: tijuca.id,
      },
    });
  }

  // ─── Pedidos ──────────────────────────────────────────────────────────────
  // Um em cada status relevante, para exercitar estoque e financeiro.
  const pedidosDemo: Array<{
    cliente: string;
    status: 'novo' | 'confirmado' | 'faturado';
    itens: Array<[string, string]>;
    shipping?: string;
    discount?: string;
  }> = [
    {
      cliente: 'Padaria Imperial',
      status: 'faturado',
      itens: [['BRW-DOCE', '30.000'], ['BRW-TRAD', '20.000']],
      shipping: '25.00',
    },
    {
      cliente: 'Café do Ponto',
      status: 'confirmado',
      itens: [['COOK-CHOC', '15.000']],
      discount: '10.00',
    },
    {
      cliente: 'Lanchonete da Esquina',
      status: 'novo',
      itens: [['BRW-TRAD', '8.000']],
    },
  ];

  const jaTemPedido = await prisma.order.count();
  if (jaTemPedido > 0) {
    console.log('[demo] já existem pedidos — pulando a criação para não duplicar.');
  } else {
    for (const [indice, pedido] of pedidosDemo.entries()) {
      const cliente = clientes.find((c) => c.tradeName === pedido.cliente)!;

      const itens = pedido.itens.map(([sku, qtd]) => {
        const produto = produtos.find((p) => p.sku === sku)!;
        const preco =
          cliente.isReseller && Number(produto.wholesalePrice) > 0
            ? produto.wholesalePrice
            : Number(qtd) >= Number(produto.minWholesaleQty) && Number(produto.wholesalePrice) > 0
              ? produto.wholesalePrice
              : produto.salePrice;

        return {
          productId: produtoPorSku.get(sku)!,
          quantity: qtd,
          unitPrice: preco,
          subtotal: (Number(qtd) * Number(preco)).toFixed(2),
        };
      });

      const subtotal = itens.reduce((t, i) => t + Number(i.subtotal), 0);
      const desconto = Number(pedido.discount ?? 0);
      const frete = Number(pedido.shipping ?? 0);
      const base = Math.max(0, subtotal - desconto);
      const total = base + frete;

      // Comissão: percentual do produto quando definido, senão o do vendedor.
      const comissao = itens.reduce((t, item, i) => {
        const produto = produtos.find((p) => p.sku === pedido.itens[i][0])!;
        const pct = produto.commissionPct === null ? 5 : Number(produto.commissionPct);
        return t + Number(item.subtotal) * (pct / 100);
      }, 0);
      const comissaoFinal = subtotal > 0 ? comissao * (base / subtotal) : 0;

      await prisma.order.create({
        data: {
          customerId: clientePorNome.get(pedido.cliente)!,
          sellerId: vendedor.id,
          status: pedido.status,
          paymentMethod: 'pix',
          orderDate: dias(-indice * 3),
          deliveryDate: dias(2 - indice),
          dueDate: dias(28 - indice * 3),
          discount: desconto.toFixed(2),
          shipping: frete.toFixed(2),
          subtotal: subtotal.toFixed(2),
          total: total.toFixed(2),
          commissionVal: comissaoFinal.toFixed(2),
          items: { create: itens },
        },
      });
    }
  }

  // ─── Configuração ─────────────────────────────────────────────────────────
  if (!(await prisma.scoreSettings.findFirst())) await prisma.scoreSettings.create({ data: {} });
  if (!(await prisma.systemSettings.findFirst())) {
    await prisma.systemSettings.create({
      data: { costWindowMonth: new Date().toISOString().slice(0, 7) },
    });
  }

  console.log(`
[demo] pronto.

  Administrador:  admin@prigor.local     / ${SENHA_DEMO}
  Vendedor:       vendedor@prigor.local  / ${SENHA_DEMO}

  ${insumos.length} insumos, ${produtos.length} produtos com ficha técnica,
  ${clientes.length} clientes, ${leads.length} leads, ${pedidosDemo.length} pedidos.

  Entre com os dois usuários: o vendedor deve enxergar apenas a carteira dele.
`);
  void admin;
}

main()
  .catch((error) => {
    console.error('[demo] falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
