import { prisma } from '@/server/db';
import { errorMessage } from './errors';
import { calculateLeadScore, type ScoreWeights } from './scoring';
import { PipelineStage, Prisma } from '@prisma/client';

/**
 * O modo simulado precisa ser LIGADO DE PROPOSITO. Sem esta flag, qualquer
 * falta de chave ou erro da API interrompe a prospeccao em vez de gravar
 * estabelecimentos ficticios no banco como se fossem leads reais.
 */
export const MOCK_PERMITIDO = process.env.ALLOW_MOCK_PLACES === 'true';

/** Prefixo que marca no proprio nome do lead que ele veio do simulador. */
export const PREFIXO_MOCK = '[SIMULADO] ';

function avisoMock(motivo: string): string {
  return `[Prospeccao][MODO SIMULADO] ${motivo}. Os leads gerados sao ficticios e vem marcados com "${PREFIXO_MOCK.trim()}".`;
}

export interface ProspectedPlace {
  googlePlaceId: string;
  tradeName: string;
  address: string;
  number?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode?: string;
  latitude: number;
  longitude: number;
  category: string;
  phone?: string;
  website?: string;
  googleRating?: number;
  googleReviewsCount?: number;
  hasPhotos?: boolean;
}

/**
 * Simulador de dados do Google Places (Mock) para fins de desenvolvimento e demonstração sem custos de API.
 */
function generateMockPlaces(
  query: string,
  category: string,
  neighborhoodName: string,
  centerLat: number,
  centerLng: number,
  limit: number = 5
): ProspectedPlace[] {
  const establishments = [
    { name: 'Café do Ponto', suffix: 'Gourmet' },
    { name: 'Padaria e Trigo', suffix: 'de Ouro' },
    { name: 'Confeitaria Imperial', suffix: 'Artisanal' },
    { name: 'Açaí da Fruta', suffix: 'Mania' },
    { name: 'Lanchonete Esquina', suffix: 'Saborosa' },
    { name: 'Restaurante Tempero', suffix: 'Carioca' },
    { name: 'Bolo Caseiro', suffix: 'da Vovó' },
    { name: 'Express Cafeteria', suffix: 'Central' },
    { name: 'Pão Quente', suffix: 'Express' },
    { name: 'Suco e Saúde', suffix: 'Natureza' },
  ];

  const results: ProspectedPlace[] = [];
  const count = Math.min(limit, establishments.length);

  for (let i = 0; i < count; i++) {
    const est = establishments[(i + query.length + category.length) % establishments.length];
    const tradeName = `${PREFIXO_MOCK}${est.name} ${neighborhoodName} ${est.suffix}`;
    
    // Pequeno offset nas coordenadas ao redor do centro do bairro
    const latOffset = (Math.random() - 0.5) * 0.015;
    const lngOffset = (Math.random() - 0.5) * 0.015;
    const latitude = centerLat + latOffset;
    const longitude = centerLng + lngOffset;

    const phone = `213${Math.floor(1000000 + Math.random() * 9000000)}`;
    const googlePlaceId = `ChIJ_mock_place_${category}_${neighborhoodName.toLowerCase().replace(/\s/g, '_')}_${i}`;

    results.push({
      googlePlaceId,
      tradeName,
      address: `Rua Principal de ${neighborhoodName}, ${100 + i * 25}`,
      number: String(100 + i * 25),
      neighborhood: neighborhoodName,
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: `20${Math.floor(70000 + Math.random() * 10000)}-000`,
      latitude,
      longitude,
      category,
      phone,
      website: Math.random() > 0.4 ? `www.${tradeName.toLowerCase().replace(/\s/g, '')}.com.br` : undefined,
      googleRating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
      googleReviewsCount: Math.floor(10 + Math.random() * 300),
      hasPhotos: Math.random() > 0.3,
    });
  }

  return results;
}

/** Campos pedidos no FieldMask da Places API (New). */
interface GooglePlaceResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  location?: { latitude?: number; longitude?: number };
}

interface GooglePlacesSearchResponse {
  places?: GooglePlaceResult[];
}

/** Configurações globais usadas pelo motor de prospecção. */
interface SystemSettingsRow {
  id: string;
  monthlyCostLimit: number;
  dailyCostLimit: number;
  apiPaused: boolean;
  currentDailyCost: number;
  currentMonthlyCost: number;
}

/**
 * Consulta a API do Google Places (New) ou gera mocks caso a chave de API não esteja configurada ou seja de desenvolvimento.
 */
export async function searchGooglePlaces(
  query: string,
  category: string,
  neighborhoodName: string,
  centerLat: number,
  centerLng: number,
  limit: number = 5
): Promise<{ places: ProspectedPlace[]; apiCostUsd: number; serviceType: 'GOOGLE_API' | 'MOCK' }> {
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const isMockKey = !apiKey || apiKey.includes('MockKey') || apiKey === '';

  if (isMockKey) {
    if (!MOCK_PERMITIDO) {
      throw new Error(
        'GOOGLE_MAPS_API_KEY nao configurada. A prospeccao foi interrompida para nao ' +
        'gravar leads ficticios no banco. Configure a chave no .env, ou defina ' +
        'ALLOW_MOCK_PLACES=true se voce quer mesmo rodar em modo simulado.'
      );
    }
    console.warn(avisoMock('GOOGLE_MAPS_API_KEY ausente ou de desenvolvimento'));
    const places = generateMockPlaces(query, category, neighborhoodName, centerLat, centerLng, limit);
    return {
      places,
      apiCostUsd: 0.0,
      serviceType: 'MOCK',
    };
  }

  try {
    // Usar API oficial Text Search do Google Places (New)
    // Documentação: https://developers.google.com/maps/documentation/places/web-service/text-search
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey as string,
        // Otimização de custos via FieldMask (paga-se apenas pelos campos selecionados)
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.location',
      },
      body: JSON.stringify({
        textQuery: `${query} no bairro ${neighborhoodName}, Rio de Janeiro`,
        maxResultCount: limit,
        locationBias: {
          circle: {
            center: { latitude: centerLat, longitude: centerLng },
            radius: 3000.0, // 3 km de raio
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Places API returned error status ${response.status}: ${errorText}`);
    }

    const data: GooglePlacesSearchResponse = await response.json();
    const googlePlaces = data.places ?? [];

    const places: ProspectedPlace[] = googlePlaces.map((p: GooglePlaceResult) => {
      return {
        googlePlaceId: p.id,
        tradeName: p.displayName?.text || 'Estabelecimento Sem Nome',
        address: p.formattedAddress || 'Endereço Indisponível',
        neighborhood: neighborhoodName,
        city: 'Rio de Janeiro',
        state: 'RJ',
        latitude: p.location?.latitude || centerLat,
        longitude: p.location?.longitude || centerLng,
        category,
        phone: p.nationalPhoneNumber || undefined,
        website: p.websiteUri || undefined,
        googleRating: p.rating || undefined,
        googleReviewsCount: p.userRatingCount || undefined,
        hasPhotos: true, // assume que tem foto se consultado pela API oficial
      };
    });

    // Custo estimado: $0.032 por chamada do Text Search (ID + Basic + Contact fields)
    const apiCostUsd = 0.032;

    return {
      places,
      apiCostUsd,
      serviceType: 'GOOGLE_API',
    };
  } catch (error: unknown) {
    if (!MOCK_PERMITIDO) {
      // Sem fallback silencioso: um erro da API nao pode virar lead ficticio
      // gravado no banco como se fosse real.
      console.error('Falha na requisicao da Google Places API:', error);
      throw new Error(
        `Falha ao consultar o Google Places: ${errorMessage(error)}. ` +
        'Nenhum lead foi gravado. Defina ALLOW_MOCK_PLACES=true se quiser ' +
        'usar dados simulados quando a API falhar.'
      );
    }
    console.warn(avisoMock(`falha na Google Places API (${errorMessage(error)})`));
    const places = generateMockPlaces(query, category, neighborhoodName, centerLat, centerLng, limit);
    return {
      places,
      apiCostUsd: 0.0,
      serviceType: 'MOCK',
    };
  }
}

/**
 * Executa o motor de prospecção e salva novos leads no banco com pontuação e distribuição territorial.
 */
export async function runProspectingEngine(params: {
  neighborhoodId: string;
  category: string;
  manual: boolean;
  limit?: number;
}): Promise<{
  success: boolean;
  runId: string;
  resultsFound: number;
  newLeads: number;
  duplicates: number;
  existingCustomers: number;
  costUsd: number;
}> {
  const { neighborhoodId, category, manual, limit = 5 } = params;

  // 1. Carregar configurações do sistema
  const settings: SystemSettingsRow | null = await prisma.systemSettings.findFirst();
  const monthlyLimit = settings?.monthlyCostLimit || 150.0;
  // O teto diário existia na configuração mas nunca era comparado com nada:
  // só o mensal pausava a API. Agora os dois valem.
  const dailyLimit = settings?.dailyCostLimit || 10.0;
  const isApiPaused = settings?.apiPaused || false;

  // Se a API estiver travada por limite de gastos, abortar
  if (isApiPaused) {
    throw new Error('O motor de prospecção está pausado temporariamente porque o limite financeiro da API do Google Maps foi atingido.');
  }

  // 2. Criar registro de execução da prospecção
  const run = await prisma.prospectingRun.create({
    data: {
      regionId: null,
      neighborhoodId,
      category,
      query: `${category} no bairro`,
      status: 'RUNNING',
    },
  });

  try {
    // 3. Buscar detalhes do Bairro
    const neighborhood = await prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      include: { region: true },
    });

    if (!neighborhood) {
      throw new Error('Bairro selecionado não existe.');
    }

    // Atualizar região no run
    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: { regionId: neighborhood.regionId },
    });

    // Coordenadas centrais aproximadas por bairro para focar a pesquisa geográfica
    // Valores reais baseados em bairros conhecidos do RJ, ou centro geral como fallback
    let centerLat = -22.9068;
    let centerLng = -43.1729;

    if (neighborhood.name.toLowerCase().includes('méier')) {
      centerLat = -22.9015;
      centerLng = -43.2798;
    } else if (neighborhood.name.toLowerCase().includes('cachambi')) {
      centerLat = -22.8906;
      centerLng = -43.2750;
    } else if (neighborhood.name.toLowerCase().includes('tijuca')) {
      centerLat = -22.9234;
      centerLng = -43.2356;
    } else if (neighborhood.name.toLowerCase().includes('copacabana')) {
      centerLat = -22.9691;
      centerLng = -43.1873;
    } else if (neighborhood.name.toLowerCase().includes('ipanema')) {
      centerLat = -22.9840;
      centerLng = -43.2012;
    } else if (neighborhood.name.toLowerCase().includes('botafogo')) {
      centerLat = -22.9515;
      centerLng = -43.1802;
    } else if (neighborhood.name.toLowerCase().includes('lapa')) {
      centerLat = -22.9135;
      centerLng = -43.1825;
    }

    // 4. Executar pesquisa Google Places (Real ou Mock)
    const searchQuery = `${category} em ${neighborhood.name}`;
    const searchResult = await searchGooglePlaces(searchQuery, category, neighborhood.name, centerLat, centerLng, limit);

    let newLeadsCount = 0;
    let duplicatesCount = 0;
    let existingCustCount = 0;

    const scoreSettings: ScoreWeights | null = await prisma.scoreSettings.findFirst();
    // Idem `scoring.ts`: coordenada e opcional, e cliente sem ela nao pode
    // participar do calculo de proximidade.
    const activeCustomers = (
      await prisma.customer.findMany({
        where: { status: 'ATIVO' },
        select: { latitude: true, longitude: true },
      })
    ).filter(
      (c: { latitude: number | null; longitude: number | null }): c is { latitude: number; longitude: number } =>
        c.latitude !== null && c.longitude !== null,
    );

    // 5. Normalizar, Deduplicar e Inserir
    for (const place of searchResult.places) {
      // Regra 1: Verificar se já é cliente Prigor (Place ID ou CNPJ)
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          OR: [
            { googlePlaceId: place.googlePlaceId },
            place.phone ? { phone: place.phone } : { id: 'dummy' },
            {
              AND: [
                { tradeName: { equals: place.tradeName, mode: 'insensitive' } },
                { address: { equals: place.address, mode: 'insensitive' } },
              ],
            },
          ],
        },
      });

      if (existingCustomer) {
        existingCustCount++;
        continue;
      }

      // Regra 2: Verificar se já existe como Lead no banco
      const existingLead = await prisma.lead.findFirst({
        where: {
          OR: [
            { googlePlaceId: place.googlePlaceId },
            place.phone ? { phone: place.phone } : { id: 'dummy' },
            {
              AND: [
                { tradeName: { equals: place.tradeName, mode: 'insensitive' } },
                { address: { equals: place.address, mode: 'insensitive' } },
              ],
            },
          ],
        },
      });

      if (existingLead) {
        duplicatesCount++;
        continue;
      }

      // Regra 3: Se não duplicado, calcular Prigor Score
      const scoreWeights: ScoreWeights = scoreSettings || {
        categoryWeight: 25,
        compatibilityWeight: 20,
        commercialWeight: 15,
        regionWeight: 15,
        digitalWeight: 10,
        nearbyWeight: 10,
        dataQualityWeight: 5,
      };

      const { score, breakdown } = await calculateLeadScore(
        {
          category: place.category,
          latitude: place.latitude,
          longitude: place.longitude,
          regionId: neighborhood.regionId,
          tradeName: place.tradeName, // Adicionado para calibragem prioritária de restaurantes
          phone: place.phone,
          website: place.website,
          googleRating: place.googleRating,
          googleReviewsCount: place.googleReviewsCount,
          hasPhotos: place.hasPhotos,
        },
        scoreWeights,
        activeCustomers
      );

      // Regra 4: Distribuição Territorial Automática
      const sellerId = neighborhood.sellerId; // Vendedor responsável pelo Bairro
      const leadStatus = sellerId ? 'ATIVO' : 'SEM_TERRITORIO';
      const leadStage = sellerId ? PipelineStage.ATRIBUIDO : PipelineStage.NOVO;

      await prisma.lead.create({
        data: {
          tradeName: place.tradeName,
          address: place.address,
          number: place.number || null,
          neighborhood: place.neighborhood,
          city: place.city,
          state: place.state,
          zipCode: place.zipCode || null,
          latitude: place.latitude,
          longitude: place.longitude,
          category: place.category,
          googlePlaceId: place.googlePlaceId,
          score,
          scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
          sellerId,
          regionId: neighborhood.regionId,
          neighborhoodId: neighborhood.id,
          pipelineStage: leadStage,
          source: manual ? 'MANUAL' : 'AUTOMATIC',
          status: leadStatus,
          priority: score >= 80 ? 'ALTA' : score >= 50 ? 'MEDIA' : 'BAIXA',
        },
      });

      newLeadsCount++;
    }

    // 6. Atualizar custos de API globais e registrar ApiUsage se for API real
    if (searchResult.apiCostUsd > 0) {
      await prisma.apiUsage.create({
        data: {
          service: 'Google Places',
          endpoint: 'Text Search',
          callCount: 1,
          estimatedCost: searchResult.apiCostUsd,
          region: neighborhood.region?.name || null,
          executionId: run.id,
        },
      });

      // Atualizar o consumo de hoje/mês nas configurações globais
      if (settings) {
        await prisma.systemSettings.update({
          where: { id: settings.id },
          data: {
            currentDailyCost: settings.currentDailyCost + searchResult.apiCostUsd,
            currentMonthlyCost: settings.currentMonthlyCost + searchResult.apiCostUsd,
            // Pausa ao estourar o teto diário OU o mensal.
            apiPaused:
              settings.currentMonthlyCost + searchResult.apiCostUsd >= monthlyLimit ||
              settings.currentDailyCost + searchResult.apiCostUsd >= dailyLimit,
          },
        });
      }
    }

    // 7. Salvar finalização da execução com sucesso
    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        resultsFound: searchResult.places.length,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        existingCust: existingCustCount,
        estimatedCost: searchResult.apiCostUsd,
        // Deixa registrado na execucao se os leads vieram do simulador,
        // para nunca confundir dado ficticio com prospeccao real.
        status: searchResult.serviceType === 'MOCK' ? 'SUCCESS_SIMULADO' : 'SUCCESS',
        errors: searchResult.serviceType === 'MOCK'
          ? 'MODO SIMULADO: leads gerados sem consultar o Google Places.'
          : null,
      },
    });

    return {
      success: true,
      runId: run.id,
      resultsFound: searchResult.places.length,
      newLeads: newLeadsCount,
      duplicates: duplicatesCount,
      existingCustomers: existingCustCount,
      costUsd: searchResult.apiCostUsd,
    };
  } catch (error: unknown) {
    console.error('Erro na execução do motor de prospecção:', error);

    await prisma.prospectingRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILED',
        errors: errorMessage(error) || 'Erro desconhecido na prospecção.',
      },
    });

    return {
      success: false,
      runId: run.id,
      resultsFound: 0,
      newLeads: 0,
      duplicates: 0,
      existingCustomers: 0,
      costUsd: 0.0,
    };
  }
}
