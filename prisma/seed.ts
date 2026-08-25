import { PrismaClient, Role, PipelineStage, ActivityType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seeding do banco de dados...');

  // Limpar tabelas existentes em ordem reversa de chaves estrangeiras
  await prisma.auditLog.deleteMany({});
  await prisma.apiUsage.deleteMany({});
  await prisma.prospectingRun.deleteMany({});
  await prisma.systemSettings.deleteMany({});
  await prisma.scoreSettings.deleteMany({});
  await prisma.scoreHistory.deleteMany({});
  await prisma.sample.deleteMany({});
  await prisma.meeting.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.neighborhood.deleteMany({});
  await prisma.region.deleteMany({});
  await prisma.seller.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Tabelas limpas com sucesso.');

  // Hashes de senha
  const passwordHashAdmin = await bcrypt.hash('admin123', 10);
  const passwordHashManager = await bcrypt.hash('manager123', 10);
  const passwordHashSeller = await bcrypt.hash('vendedor123', 10);

  // 1. Criar Usuários
  const userAdmin = await prisma.user.create({
    data: {
      name: 'Administrador Geral',
      email: 'admin@prigor.com',
      phone: '21999999999',
      passwordHash: passwordHashAdmin,
      role: Role.ADMIN,
    },
  });

  const userManager = await prisma.user.create({
    data: {
      name: 'Gestor Comercial',
      email: 'manager@prigor.com',
      phone: '21988888888',
      passwordHash: passwordHashManager,
      role: Role.MANAGER,
    },
  });

  const sellersData = [
    { name: 'João Silva', email: 'joao@prigor.com' },
    { name: 'Maria Souza', email: 'maria@prigor.com' },
    { name: 'Pedro Santos', email: 'pedro@prigor.com' },
    { name: 'Ana Oliveira', email: 'ana@prigor.com' },
    { name: 'Lucas Lima', email: 'lucas@prigor.com' },
  ];

  const sellers: any[] = [];

  for (const s of sellersData) {
    const user = await prisma.user.create({
      data: {
        name: s.name,
        email: s.email,
        phone: '21977777777',
        passwordHash: passwordHashSeller,
        role: Role.SELLER,
      },
    });

    const seller = await prisma.seller.create({
      data: {
        userId: user.id,
        name: s.name,
        phone: user.phone,
        goal: 10, // meta de 10 novos revendedores/mês
      },
    });
    sellers.push(seller);
  }

  console.log('Usuários e vendedores cadastrados.');

  // 2. Criar Regiões
  const regionNorte = await prisma.region.create({
    data: { name: 'Zona Norte', description: 'Região da Zona Norte do Rio de Janeiro' },
  });
  const regionSul = await prisma.region.create({
    data: { name: 'Zona Sul', description: 'Região da Zona Sul do Rio de Janeiro' },
  });
  const regionCentro = await prisma.region.create({
    data: { name: 'Centro', description: 'Região Central do Rio de Janeiro' },
  });

  console.log('Regiões cadastradas.');

  // 3. Criar Bairros e associar a vendedores
  const joao = sellers[0];
  const maria = sellers[1];
  const pedro = sellers[2];
  const ana = sellers[3];
  const lucas = sellers[4];

  // Zona Norte
  const bMeier = await prisma.neighborhood.create({
    data: { name: 'Méier', city: 'Rio de Janeiro', state: 'RJ', regionId: regionNorte.id, sellerId: joao.id },
  });
  const bCachambi = await prisma.neighborhood.create({
    data: { name: 'Cachambi', city: 'Rio de Janeiro', state: 'RJ', regionId: regionNorte.id, sellerId: joao.id },
  });
  const bTijuca = await prisma.neighborhood.create({
    data: { name: 'Tijuca', city: 'Rio de Janeiro', state: 'RJ', regionId: regionNorte.id, sellerId: maria.id },
  });
  const bVilaIsabel = await prisma.neighborhood.create({
    data: { name: 'Vila Isabel', city: 'Rio de Janeiro', state: 'RJ', regionId: regionNorte.id, sellerId: maria.id },
  });

  // Zona Sul
  const bCopacabana = await prisma.neighborhood.create({
    data: { name: 'Copacabana', city: 'Rio de Janeiro', state: 'RJ', regionId: regionSul.id, sellerId: pedro.id },
  });
  const bIpanema = await prisma.neighborhood.create({
    data: { name: 'Ipanema', city: 'Rio de Janeiro', state: 'RJ', regionId: regionSul.id, sellerId: pedro.id },
  });
  const bBotafogo = await prisma.neighborhood.create({
    data: { name: 'Botafogo', city: 'Rio de Janeiro', state: 'RJ', regionId: regionSul.id, sellerId: ana.id },
  });
  const bFlamengo = await prisma.neighborhood.create({
    data: { name: 'Flamengo', city: 'Rio de Janeiro', state: 'RJ', regionId: regionSul.id, sellerId: ana.id },
  });

  // Centro
  const bCentro = await prisma.neighborhood.create({
    data: { name: 'Centro', city: 'Rio de Janeiro', state: 'RJ', regionId: regionCentro.id, sellerId: lucas.id },
  });
  const bLapa = await prisma.neighborhood.create({
    data: { name: 'Lapa', city: 'Rio de Janeiro', state: 'RJ', regionId: regionCentro.id, sellerId: lucas.id },
  });

  console.log('Bairros cadastrados e associados.');

  // 4. Criar Clientes Atuais da Prigor (Clientes Existentes)
  const cust1 = await prisma.customer.create({
    data: {
      tradeName: 'Padaria e Confeitaria Imperial',
      legalName: 'Panificadora Imperial Ltda',
      cnpj: '12345678000199',
      phone: '2122223333',
      address: 'Rua Cachambi, 450',
      number: '450',
      neighborhood: 'Cachambi',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20775-182',
      latitude: -22.8906,
      longitude: -43.2750,
      category: 'padarias',
      sellerId: joao.id,
      regionId: regionNorte.id,
      neighborhoodId: bCachambi.id,
      status: 'ATIVO',
      googlePlaceId: 'ChIJ_imperial_cachambi_place_id',
    },
  });

  const cust2 = await prisma.customer.create({
    data: {
      tradeName: 'Café Carioca Tijuca',
      legalName: 'Cafeteria Carioca da Tijuca Eireli',
      cnpj: '98765432000188',
      phone: '2133334444',
      address: 'Praça Saens Peña, 12',
      number: '12',
      neighborhood: 'Tijuca',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20520-090',
      latitude: -22.9234,
      longitude: -43.2356,
      category: 'cafeterias',
      sellerId: maria.id,
      regionId: regionNorte.id,
      neighborhoodId: bTijuca.id,
      status: 'ATIVO',
      googlePlaceId: 'ChIJ_cafe_carioca_place_id',
    },
  });

  const cust3 = await prisma.customer.create({
    data: {
      tradeName: 'Empório Copacabana',
      legalName: 'Lanchonete e Empório Atlântico Ltda',
      cnpj: '45678901000177',
      phone: '2125251212',
      address: 'Avenida Atlântica, 2300',
      number: '2300',
      neighborhood: 'Copacabana',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '22040-010',
      latitude: -22.9691,
      longitude: -43.1873,
      category: 'lanchonetes',
      sellerId: pedro.id,
      regionId: regionSul.id,
      neighborhoodId: bCopacabana.id,
      status: 'ATIVO',
      googlePlaceId: 'ChIJ_emporio_copacabana_place_id',
    },
  });

  console.log('Clientes existentes cadastrados.');

  // 5. Criar Leads (Potenciais Clientes)
  // Lead 1: Café do Meier (Méier, atribuído ao João, Score Quente: 91)
  const lead1 = await prisma.lead.create({
    data: {
      tradeName: 'Café Gourmet do Meier',
      address: 'Rua Dias da Cruz, 255',
      number: '255',
      neighborhood: 'Méier',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20720-010',
      latitude: -22.9015,
      longitude: -43.2798,
      category: 'cafeterias',
      googlePlaceId: 'ChIJ_cafe_meier_place_id',
      score: 91,
      scoreBreakdown: {
        category: 24,
        compatibility: 19,
        commercial_potential: 14,
        region: 14,
        digital_presence: 9,
        nearby_customers: 10,
        data_quality: 5,
      },
      sellerId: joao.id,
      regionId: regionNorte.id,
      neighborhoodId: bMeier.id,
      pipelineStage: PipelineStage.QUALIFICADO,
      source: 'AUTOMATIC',
      priority: 'ALTA',
    },
  });

  // Lead 2: Açaí do Cachambi (Cachambi, atribuído ao João, Score: 84)
  const lead2 = await prisma.lead.create({
    data: {
      tradeName: 'Açaí e Lanches Cachambi',
      address: 'Rua Ferreira de Andrade, 320',
      number: '320',
      neighborhood: 'Cachambi',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20780-200',
      latitude: -22.8895,
      longitude: -43.2730,
      category: 'açaiterias',
      googlePlaceId: 'ChIJ_acai_cachambi_place_id',
      score: 84,
      scoreBreakdown: {
        category: 20,
        compatibility: 18,
        commercial_potential: 13,
        region: 14,
        digital_presence: 8,
        nearby_customers: 7,
        data_quality: 4,
      },
      sellerId: joao.id,
      regionId: regionNorte.id,
      neighborhoodId: bCachambi.id,
      pipelineStage: PipelineStage.NOVO,
      source: 'AUTOMATIC',
      priority: 'MEDIA',
    },
  });

  // Lead 3: Bolo Caseiro Tijuca (Tijuca, atribuída à Maria, abordado, Score: 78)
  const lead3 = await prisma.lead.create({
    data: {
      tradeName: 'Bolo Caseiro e Café Tijuca',
      address: 'Rua Conde de Bonfim, 302',
      number: '302',
      neighborhood: 'Tijuca',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20520-054',
      latitude: -22.9248,
      longitude: -43.2322,
      category: 'confeitarias',
      googlePlaceId: 'ChIJ_bolo_tijuca_place_id',
      score: 78,
      scoreBreakdown: {
        category: 22,
        compatibility: 15,
        commercial_potential: 12,
        region: 12,
        digital_presence: 7,
        nearby_customers: 6,
        data_quality: 4,
      },
      sellerId: maria.id,
      regionId: regionNorte.id,
      neighborhoodId: bTijuca.id,
      pipelineStage: PipelineStage.ABORDADO,
      source: 'AUTOMATIC',
      priority: 'MEDIA',
    },
  });

  // Lead 4: Delícias de Ipanema (Ipanema, atribuído ao Pedro, Contato Realizado, Score: 85)
  const lead4 = await prisma.lead.create({
    data: {
      tradeName: 'Delícias & Conveniência Ipanema',
      address: 'Rua Visconde de Pirajá, 150',
      number: '150',
      neighborhood: 'Ipanema',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '22410-000',
      latitude: -22.9840,
      longitude: -43.2012,
      category: 'conveniências',
      googlePlaceId: 'ChIJ_delicias_ipanema_place_id',
      score: 85,
      scoreBreakdown: {
        category: 18,
        compatibility: 20,
        commercial_potential: 15,
        region: 15,
        digital_presence: 9,
        nearby_customers: 4,
        data_quality: 4,
      },
      sellerId: pedro.id,
      regionId: regionSul.id,
      neighborhoodId: bIpanema.id,
      pipelineStage: PipelineStage.CONTATO_REALIZADO,
      source: 'AUTOMATIC',
      priority: 'MEDIA',
    },
  });

  // Lead 5: Suco e Cia Botafogo (Botafogo, atribuído à Ana, Negociação, Score: 88)
  const lead5 = await prisma.lead.create({
    data: {
      tradeName: 'Suco & Cia Botafogo',
      address: 'Rua Voluntários da Pátria, 88',
      number: '88',
      neighborhood: 'Botafogo',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '22270-010',
      latitude: -22.9515,
      longitude: -43.1802,
      category: 'lanchonetes',
      googlePlaceId: 'ChIJ_suco_botafogo_place_id',
      score: 88,
      scoreBreakdown: {
        category: 25,
        compatibility: 18,
        commercial_potential: 14,
        region: 15,
        digital_presence: 8,
        nearby_customers: 3,
        data_quality: 5,
      },
      sellerId: ana.id,
      regionId: regionSul.id,
      neighborhoodId: bBotafogo.id,
      pipelineStage: PipelineStage.NEGOCIACAO,
      source: 'AUTOMATIC',
      priority: 'ALTA',
    },
  });

  // Lead 6: Lead Sem Território (Campo Grande, sem vendedor, na fila manual)
  const lead6 = await prisma.lead.create({
    data: {
      tradeName: 'Cafeteria Grande Rio',
      address: 'Estrada do Cabuçu, 120',
      number: '120',
      neighborhood: 'Campo Grande',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '23017-250',
      latitude: -22.9023,
      longitude: -43.5589,
      category: 'cafeterias',
      googlePlaceId: 'ChIJ_sem_territorio_place_id',
      score: 65,
      scoreBreakdown: {
        category: 25,
        compatibility: 15,
        commercial_potential: 10,
        region: 5,
        digital_presence: 6,
        nearby_customers: 0,
        data_quality: 4,
      },
      sellerId: null,
      regionId: null,
      neighborhoodId: null,
      pipelineStage: PipelineStage.NOVO,
      status: 'SEM_TERRITORIO',
      source: 'AUTOMATIC',
      priority: 'BAIXA',
    },
  });

  console.log('Leads cadastrados.');

  // 6. Criar Atividades (Histórico de abordagens)
  await prisma.activity.create({
    data: {
      leadId: lead3.id,
      sellerId: maria.id,
      type: ActivityType.VISIT,
      description: 'Visita de prospecção presencial. Deixou brownie de amostra e conversou com o gerente.',
      latitude: -22.9248,
      longitude: -43.2322,
      result: 'Interessado em agendar reunião de compras.',
    },
  });

  await prisma.activity.create({
    data: {
      leadId: lead4.id,
      sellerId: pedro.id,
      type: ActivityType.WHATSAPP,
      description: 'Abordagem via WhatsApp enviando apresentação comercial.',
      result: 'Respondeu solicitando preços de atacado.',
    },
  });

  await prisma.activity.create({
    data: {
      leadId: lead5.id,
      sellerId: ana.id,
      type: ActivityType.MEETING,
      description: 'Reunião comercial presencial para apresentar sabores e alinhar termos.',
      result: 'Aguardando aprovação do contrato de revenda.',
    },
  });

  console.log('Atividades e histórico criados.');

  // 7. Criar Amostras entregues
  await prisma.sample.create({
    data: {
      leadId: lead3.id,
      sellerId: maria.id,
      product: 'Brownie Recheado 7x5 cm',
      quantity: 5,
      flavors: 'Doce de Leite, Brigadeiro, Nutella',
      observation: 'Deixou 5 amostras variadas para o time de atendimento testar.',
      result: 'GOSTOU',
    },
  });

  console.log('Amostras de brownie cadastradas.');

  // 8. Configuração de Score padrão
  await prisma.scoreSettings.create({
    data: {
      categoryWeight: 25,
      compatibilityWeight: 20,
      commercialWeight: 15,
      regionWeight: 15,
      digitalWeight: 10,
      nearbyWeight: 10,
      dataQualityWeight: 5,
    },
  });

  console.log('Configurações de score cadastradas.');

  // 9. Configurações Globais do Sistema
  await prisma.systemSettings.create({
    data: {
      dailyCostLimit: 10.0,
      monthlyCostLimit: 150.0,
      currentDailyCost: 0.0,
      currentMonthlyCost: 0.0,
      apiPaused: false,
      nearbyRadiusKm: 5,
      whatsappTemplate: 'Olá! Tudo bem? Sou {vendedor}, da Doces Prigor. Estamos ampliando nossa rede de pontos de revenda na região de {bairro} e acredito que nosso produto combine muito com o perfil do {estabelecimento}. Já atendemos outros pontos próximos como o {cliente_proximo}. Podemos conversar rapidinho?',
    },
  });

  console.log('Configurações do sistema cadastradas.');

  console.log('Seeding finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
