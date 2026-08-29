import { Prisma, ScoreSettings } from '@prisma/client';
import { prisma } from '@/server/db';
import { calculateHaversineDistance } from './geocoding';

export interface ScoreBreakdown {
  category: number;
  compatibility: number;
  commercial_potential: number;
  region: number;
  digital_presence: number;
  nearby_customers: number;
  data_quality: number;
}

export interface ScoreCalculationResult {
  score: number;
  breakdown: ScoreBreakdown;
}

/** Apenas os pesos usados no cálculo — aceita o registro completo de ScoreSettings. */
export type ScoreWeights = Pick<
  ScoreSettings,
  | 'categoryWeight'
  | 'compatibilityWeight'
  | 'commercialWeight'
  | 'regionWeight'
  | 'digitalWeight'
  | 'nearbyWeight'
  | 'dataQualityWeight'
>;

/** Campos de um lead que alimentam o cálculo do score. */
export interface LeadScoreInput {
  category: string;
  latitude: number;
  longitude: number;
  regionId: string | null;
  tradeName?: string | null; // Adicionado para identificar nome fantasia
  phone?: string | null;
  email?: string | null;
  cnpj?: string | null;
  number?: string | null;
  zipCode?: string | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
  website?: string | null;
  hasPhotos?: boolean;
}

/**
 * Calcula o Prigor Score para um Lead específico com base nas configurações de pesos.
 */
export async function calculateLeadScore(
  lead: LeadScoreInput,
  weights: ScoreWeights,
  activeCustomers: { latitude: number; longitude: number }[] = []
): Promise<ScoreCalculationResult> {
  
  // 1. Categoria (0 a 100)
  // Cafeterias, padarias, confeitarias, açaiterias, lanchonetes são prioridade total.
  // Restaurantes de comida a quilo, self-service e pensões são altamente priorizados por venderem no caixa.
  const mainCategories = ['cafeterias', 'padarias', 'confeitarias', 'açaiterias', 'lanchonetes', 'cafeteria', 'padaria', 'confeitaria', 'açaiteria', 'lanchonete'];
  const secondaryCategories = ['restaurantes', 'mercados', 'hotéis', 'conveniências', 'restaurante', 'mercado', 'hotel', 'conveniência'];
  
  const categoryLower = lead.category.toLowerCase().trim();
  const nameLower = (lead.tradeName || '').toLowerCase().trim();
  
  // Identificar se é restaurante comida a quilo ou pensão
  let isPriorityRestaurant = false;
  const payAtCashierKeywords = ['quilo', 'kilo', 'self-service', 'self service', 'pensão', 'pensao', 'comida caseira', 'quentinhas', 'prato feito', 'restaurante popular'];
  
  if (categoryLower.includes('restaurante') || categoryLower.includes('restaurantes') || categoryLower.includes('comida') || categoryLower.includes('pensão')) {
    if (payAtCashierKeywords.some(kw => nameLower.includes(kw) || categoryLower.includes(kw))) {
      isPriorityRestaurant = true;
    }
  }

  let categoryScore = 20; // default low
  
  if (mainCategories.some(cat => categoryLower.includes(cat)) || isPriorityRestaurant) {
    categoryScore = 100;
  } else if (secondaryCategories.some(cat => categoryLower.includes(cat))) {
    categoryScore = 60;
  }

  // 2. Compatibilidade (0 a 100)
  // Cafeterias, confeitarias e padarias são os pares ideais de brownie.
  let compatibilityScore = 20;
  if (['cafeterias', 'confeitarias', 'padarias', 'cafeteria', 'confeitaria', 'padaria'].some(cat => categoryLower.includes(cat))) {
    compatibilityScore = 100;
  } else if (isPriorityRestaurant) {
    compatibilityScore = 90; // alta prioridade porque os brownies são expostos no balcão do caixa
  } else if (['lanchonetes', 'açaiterias', 'lanchonete', 'açaiteria'].some(cat => categoryLower.includes(cat))) {
    compatibilityScore = 80;
  } else if (['restaurantes', 'conveniências', 'restaurante', 'conveniência'].some(cat => categoryLower.includes(cat))) {
    compatibilityScore = 50;
  }

  // 3. Potencial Comercial (0 a 100)
  // Baseado nas avaliações do Google Places
  const rating = lead.googleRating !== undefined ? lead.googleRating : null;
  let commercialScore = 50; // default médio
  if (rating !== null && rating > 0) {
    if (rating >= 4.5) commercialScore = 100;
    else if (rating >= 4.0) commercialScore = 85;
    else if (rating >= 3.0) commercialScore = 60;
    else commercialScore = 30;
  }

  // 4. Região (0 a 100)
  // Se está associado a uma região ativa
  let regionScore = 0;
  if (lead.regionId) {
    const region = await prisma.region.findUnique({
      where: { id: lead.regionId },
    });
    if (region) {
      regionScore = region.active ? 100 : 50;
    }
  }

  // 5. Presença Digital (0 a 100)
  let digitalScore = 0;
  if (lead.website) digitalScore += 50;
  const reviews = lead.googleReviewsCount !== undefined ? lead.googleReviewsCount : null;
  if (reviews !== null) {
    if (reviews >= 100) digitalScore += 30;
    else if (reviews >= 20) digitalScore += 20;
    else if (reviews >= 5) digitalScore += 10;
  }
  if (lead.hasPhotos) digitalScore += 20;
  digitalScore = Math.min(100, digitalScore);

  // 6. Clientes Prigor Próximos (0 a 100)
  // Raio de 3 km para densidade comercial
  let nearbyCustomersCount = 0;
  if (activeCustomers.length > 0) {
    nearbyCustomersCount = activeCustomers.filter(c => 
      calculateHaversineDistance(lead.latitude, lead.longitude, c.latitude, c.longitude) <= 3.0
    ).length;
  } else {
    // Buscar no banco se não fornecido
    const customers = await prisma.customer.findMany({
      where: { status: 'ATIVO' },
      select: { latitude: true, longitude: true }
    });
    nearbyCustomersCount = (customers as Array<{ latitude: number | null; longitude: number | null }>)
      .filter(
        (c) =>
          c.latitude !== null &&
          c.longitude !== null &&
          calculateHaversineDistance(lead.latitude, lead.longitude, c.latitude, c.longitude) <= 3.0,
      ).length;
  }

  let nearbyScore = 0;
  if (nearbyCustomersCount >= 3) nearbyScore = 100;
  else if (nearbyCustomersCount === 2) nearbyScore = 80;
  else if (nearbyCustomersCount === 1) nearbyScore = 60;
  else nearbyScore = 30; // sem clientes por perto ainda dá 30 pontos (oportunidade de pioneirismo)

  // 7. Qualidade dos Dados (0 a 100)
  let dataQualityScore = 0;
  if (lead.phone) dataQualityScore += 30;
  if (lead.cnpj) dataQualityScore += 30;
  if (lead.number && lead.zipCode) dataQualityScore += 20;
  if (lead.email || lead.website) dataQualityScore += 20;

  // Cálculo ponderado final
  const cWeight = weights.categoryWeight;
  const compWeight = weights.compatibilityWeight;
  const commWeight = weights.commercialWeight;
  const rWeight = weights.regionWeight;
  const digWeight = weights.digitalWeight;
  const nWeight = weights.nearbyWeight;
  const dqWeight = weights.dataQualityWeight;

  const scoreContribCategory = Math.round((categoryScore * cWeight) / 100);
  const scoreContribCompatibility = Math.round((compatibilityScore * compWeight) / 100);
  const scoreContribCommercial = Math.round((commercialScore * commWeight) / 100);
  const scoreContribRegion = Math.round((regionScore * rWeight) / 100);
  const scoreContribDigital = Math.round((digitalScore * digWeight) / 100);
  const scoreContribNearby = Math.round((nearbyScore * nWeight) / 100);
  const scoreContribDataQuality = Math.round((dataQualityScore * dqWeight) / 100);

  const finalScore = Math.min(
    100,
    scoreContribCategory +
      scoreContribCompatibility +
      scoreContribCommercial +
      scoreContribRegion +
      scoreContribDigital +
      scoreContribNearby +
      scoreContribDataQuality
  );

  return {
    score: finalScore,
    breakdown: {
      category: scoreContribCategory,
      compatibility: scoreContribCompatibility,
      commercial_potential: scoreContribCommercial,
      region: scoreContribRegion,
      digital_presence: scoreContribDigital,
      nearby_customers: scoreContribNearby,
      data_quality: scoreContribDataQuality,
    },
  };
}

/**
 * Recalcula e atualiza o score de todos os Leads pendentes (não convertidos a clientes)
 */
export async function recalculateAllLeadsScores(): Promise<number> {
  const weights: ScoreWeights | null = await prisma.scoreSettings.findFirst();
  if (!weights) return 0;

  const activeLeads: Array<LeadScoreInput & { id: string }> = await prisma.lead.findMany({
    where: {
      convertedCustomerId: null,
      status: { in: ['ATIVO', 'SEM_TERRITORIO'] }
    }
  });

  // Coordenada e opcional no cadastro: cliente sem lat/lng entrava na conta
  // de distancia como NaN e envenenava o criterio "clientes por perto".
  const activeCustomers = (
    await prisma.customer.findMany({
      where: { status: 'ATIVO' },
      select: { latitude: true, longitude: true },
    })
  ).filter(
    (c: { latitude: number | null; longitude: number | null }): c is { latitude: number; longitude: number } =>
      c.latitude !== null && c.longitude !== null,
  );

  let count = 0;
  for (const lead of activeLeads) {
    const { score, breakdown } = await calculateLeadScore(lead, weights, activeCustomers);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        score,
        scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      }
    });
    count++;
  }

  return count;
}
