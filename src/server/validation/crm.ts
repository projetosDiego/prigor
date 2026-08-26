/**
 * Schemas de lead, atividade, território, prospecção e configuração de sistema.
 *
 * Estas rotas eram as últimas que liam `request.json()` cru e gravavam o corpo
 * quase inteiro no banco. Tudo aqui é lista fechada: campo desconhecido não
 * chega ao Prisma, enum inválido vira 422 e número vindo como string é
 * convertido uma vez só, na fronteira.
 *
 * ATENÇÃO ao usar os blocos de `common.ts`: `optionalText`, `digits` e `email`
 * são uniões com `transform`, e no zod 4 isso torna a CHAVE obrigatória —
 * campo simplesmente ausente do objeto vira erro de validação, mesmo o bloco
 * aceitando `undefined` como valor. Por isso todo campo realmente opcional
 * daqui leva `.optional()` explícito; os apelidos locais abaixo já o embutem.
 */
import { z } from 'zod';

import {
  digits,
  email,
  money,
  optionalText,
  quantity,
  requiredText,
  uuid,
} from './common';

/** Texto opcional cuja chave pode faltar. Devolve `null` para vazio. */
const text = (max = 255) => optionalText(max).optional();

/** Documento/CEP opcional cuja chave pode faltar. */
const onlyDigits = (label: string, length: number[]) =>
  digits(label, { length }).optional();

/** E-mail opcional cuja chave pode faltar. */
const optionalEmail = () => email().optional();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Uuid opcional que aceita string vazia como "nenhum".
 *
 * As telas do CRM mandam `sellerId: ''` para devolver um lead ou um bairro à
 * fila de triagem, e `optionalUuid` de `common.ts` recusa string vazia: o
 * campo cairia em 422 justamente na operação de desatribuir.
 */
const nullableUuid = (label: string) =>
  z
    .union([z.string(), z.null()])
    .transform((v, ctx) => {
      if (v === null || v.trim() === '') return null;
      if (!UUID_PATTERN.test(v)) {
        ctx.addIssue({ code: 'custom', message: `${label} inválido.` });
        return z.NEVER;
      }
      return v;
    })
    .optional();

// ─── Enums do domínio ───────────────────────────────────────────────────────

export const pipelineStageSchema = z.enum([
  'NOVO',
  'QUALIFICADO',
  'ATRIBUIDO',
  'ABORDADO',
  'CONTATO_REALIZADO',
  'INTERESSADO',
  'REUNIAO',
  'AMOSTRA',
  'NEGOCIACAO',
  'NOVO_REVENDEDOR',
  'PERDIDO',
]);

export type PipelineStageValue = z.infer<typeof pipelineStageSchema>;

export const lossReasonSchema = z.enum([
  'SEM_INTERESSE',
  'PRECO',
  'JA_POSSUI_FORNECEDOR',
  'PRODUZ_INTERNAMENTE',
  'NAO_TRABALHA_COM_SOBREMESAS',
  'BAIXO_MOVIMENTO',
  'ESTABELECIMENTO_FECHADO',
  'CONTATO_INVALIDO',
  'RESPONSAVEL_NAO_ENCONTRADO',
  'OUTRO',
]);

export const activityTypeSchema = z.enum([
  'VISIT',
  'WHATSAPP',
  'PHONE',
  'MEETING',
  'SAMPLE',
  'NOTE',
  'STATUS_CHANGE',
  'ASSIGNMENT',
]);

export type ActivityTypeValue = z.infer<typeof activityTypeSchema>;

export const meetingStatusSchema = z.enum([
  'AGENDADA',
  'REALIZADA',
  'CANCELADA',
  'NAO_COMPARECEU',
]);

export const sampleResultSchema = z.enum([
  'GOSTOU',
  'INTERESSADO',
  'PENSANDO',
  'NAO_GOSTOU',
  'SEM_INTERESSE',
]);

/** `status` do lead é coluna de texto livre no banco, mas só estes valores são válidos. */
export const leadStatusSchema = z.enum(['ATIVO', 'SEM_TERRITORIO', 'PERDIDO']);

export const leadPrioritySchema = z.enum(['ALTA', 'MEDIA', 'BAIXA']);

// ─── Coordenadas ────────────────────────────────────────────────────────────

const coordinate = (label: string, limit: number) =>
  z
    .union([z.number(), z.string(), z.null()])
    .transform((v, ctx) => {
      if (v === null || v === '') return null;
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) {
        ctx.addIssue({ code: 'custom', message: `${label} inválida.` });
        return z.NEVER;
      }
      return parsed;
    })
    .optional();

export const optionalLatitude = () => coordinate('Latitude', 90);
export const optionalLongitude = () => coordinate('Longitude', 180);

/** Coordenada obrigatória — usada na busca por proximidade. */
const requiredCoordinate = (label: string, limit: number) =>
  z.coerce
    .number({ message: `${label} é obrigatória.` })
    .refine((v) => Number.isFinite(v) && Math.abs(v) <= limit, `${label} inválida.`);

// ─── Lead ───────────────────────────────────────────────────────────────────

export const leadCreateSchema = z.object({
  tradeName: requiredText('Nome fantasia', 200),
  legalName: text(200),
  cnpj: onlyDigits('CNPJ', [14]),
  phone: text(40),
  mobile: text(40),
  email: optionalEmail(),
  address: requiredText('Endereço', 255),
  number: text(20),
  complement: text(120),
  neighborhood: requiredText('Bairro', 120),
  city: z.string().trim().min(1).max(120).default('Rio de Janeiro'),
  state: z.string().trim().min(2).max(2).default('RJ'),
  zipCode: onlyDigits('CEP', [8]),
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
  category: requiredText('Categoria', 120),
  priority: leadPrioritySchema.default('MEDIA'),
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

/**
 * Atualização de lead.
 *
 * `sellerId` só é aceito de gestão — quem decide isso é a rota; aqui garantimos
 * apenas que o valor tem o tipo certo.
 */
export const leadUpdateSchema = z
  .object({
    tradeName: requiredText('Nome fantasia', 200).optional(),
    legalName: text(200),
    cnpj: onlyDigits('CNPJ', [14]),
    phone: text(40),
    mobile: text(40),
    email: optionalEmail(),
    address: requiredText('Endereço', 255).optional(),
    number: text(20),
    complement: text(120),
    neighborhood: requiredText('Bairro', 120).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(2).max(2).optional(),
    zipCode: onlyDigits('CEP', [8]),
    latitude: optionalLatitude(),
    longitude: optionalLongitude(),
    category: requiredText('Categoria', 120).optional(),
    priority: leadPrioritySchema.optional(),
    score: z.coerce.number().int().min(0).max(100).optional(),
    status: leadStatusSchema.optional(),
    pipelineStage: pipelineStageSchema.optional(),
    /** String vazia significa "devolver para a fila de triagem". */
    sellerId: nullableUuid('Vendedor'),
    lossReason: lossReasonSchema.optional(),
    lossNotes: text(2000),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.')
  .refine((v) => v.pipelineStage !== 'PERDIDO' || v.lossReason !== undefined, {
    message: 'Informe o motivo da perda.',
    path: ['lossReason'],
  });

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

/**
 * `sellerId=null` (a string) é o filtro de "leads sem vendedor" que a tela de
 * triagem usa; qualquer outro valor tem de ser um uuid.
 */
const sellerFilter = z
  .string()
  .transform((v, ctx) => {
    if (v === '') return undefined;
    if (v === 'null') return null;
    if (!UUID_PATTERN.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'Vendedor inválido.' });
      return z.NEVER;
    }
    return v;
  })
  .optional();

export const leadListQuerySchema = z.object({
  regionId: nullableUuid('Região'),
  neighborhoodId: nullableUuid('Bairro'),
  category: z.string().trim().max(120).optional(),
  pipelineStage: pipelineStageSchema.optional(),
  priority: leadPrioritySchema.optional(),
  status: leadStatusSchema.optional(),
  sellerId: sellerFilter,
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

// ─── Atividade ──────────────────────────────────────────────────────────────

export const activityCreateSchema = z
  .object({
    leadId: nullableUuid('Lead'),
    customerId: nullableUuid('Cliente'),
    /** Só gestão pode informar; a rota ignora o campo para vendedor. */
    sellerId: nullableUuid('Vendedor'),
    type: activityTypeSchema,
    description: requiredText('Descrição', 2000),
    result: text(2000),
    latitude: optionalLatitude(),
    longitude: optionalLongitude(),

    sampleQuantity: z.coerce.number().int().min(1).max(1000).default(1),
    sampleFlavors: text(255),
    sampleResult: sampleResultSchema.optional(),

    // O formulário manda o campo vazio quando o vendedor não escolhe data;
    // nesse caso a rota agenda para agora, como antes.
    meetingDate: z
      .union([z.string(), z.date(), z.null()])
      .transform((v, ctx) => {
        if (v === null || v === '') return null;
        const date = v instanceof Date ? v : new Date(v);
        if (Number.isNaN(date.getTime())) {
          ctx.addIssue({ code: 'custom', message: 'Data da reunião inválida.' });
          return z.NEVER;
        }
        return date;
      })
      .optional(),
    meetingLocation: text(255),
    meetingObservation: text(2000),
    meetingStatus: meetingStatusSchema.default('AGENDADA'),
  })
  .refine(
    (v) => Boolean(v.leadId) || Boolean(v.customerId),
    'É necessário associar a atividade a um Lead ou Cliente.',
  )
  .refine(
    (v) => !['SAMPLE', 'MEETING'].includes(v.type) || Boolean(v.leadId),
    'Amostras e reuniões precisam estar associadas a um Lead.',
  );

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const activityListQuerySchema = z.object({
  leadId: nullableUuid('Lead'),
  customerId: nullableUuid('Cliente'),
  sellerId: nullableUuid('Vendedor'),
  type: activityTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Região e bairro ────────────────────────────────────────────────────────

export const regionInputSchema = z.object({
  name: requiredText('Nome da região', 120),
  description: text(500),
  active: z.boolean().default(true),
});

export const regionUpdateSchema = z
  .object({
    name: requiredText('Nome da região', 120).optional(),
    description: text(500),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const regionListQuerySchema = z.object({
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

export const neighborhoodInputSchema = z.object({
  name: requiredText('Nome do bairro', 120),
  city: z.string().trim().min(1).max(120).default('Rio de Janeiro'),
  state: z.string().trim().min(2).max(2).default('RJ'),
  regionId: uuid('Região'),
  sellerId: nullableUuid('Vendedor'),
  active: z.boolean().default(true),
});

export const neighborhoodUpdateSchema = z
  .object({
    name: requiredText('Nome do bairro', 120).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(2).max(2).optional(),
    regionId: uuid('Região').optional(),
    sellerId: nullableUuid('Vendedor'),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const neighborhoodListQuerySchema = z.object({
  regionId: nullableUuid('Região'),
  sellerId: nullableUuid('Vendedor'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

// ─── Prospecção ─────────────────────────────────────────────────────────────

export const prospectingRunSchema = z.object({
  neighborhoodId: uuid('Bairro'),
  category: requiredText('Categoria', 120),
  limit: z.coerce.number().int().min(1).max(60).default(5),
});

export const prospectingRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Configuração de score ──────────────────────────────────────────────────

const weight = (label: string) =>
  z.coerce
    .number({ message: `${label} deve ser um número.` })
    .int(`${label} deve ser inteiro.`)
    .min(0, `${label} não pode ser negativo.`)
    .max(100, `${label} não pode passar de 100.`);

export const scoreWeightsSchema = z
  .object({
    categoryWeight: weight('Peso de categoria'),
    compatibilityWeight: weight('Peso de compatibilidade'),
    commercialWeight: weight('Peso de potencial comercial'),
    regionWeight: weight('Peso de região'),
    digitalWeight: weight('Peso de presença digital'),
    nearbyWeight: weight('Peso de proximidade'),
    dataQualityWeight: weight('Peso de qualidade dos dados'),
    reason: text(500),
  })
  .superRefine((v, ctx) => {
    const sum =
      v.categoryWeight +
      v.compatibilityWeight +
      v.commercialWeight +
      v.regionWeight +
      v.digitalWeight +
      v.nearbyWeight +
      v.dataQualityWeight;
    if (sum !== 100) {
      ctx.addIssue({
        code: 'custom',
        message: `A soma dos pesos deve ser exatamente 100%. Soma informada: ${sum}%`,
      });
    }
  });

export type ScoreWeightsInput = z.infer<typeof scoreWeightsSchema>;

export const scoreHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Configuração de consumo de API ─────────────────────────────────────────

const costLimit = (label: string) =>
  z.coerce
    .number({ message: `${label} deve ser um número.` })
    .min(0, `${label} não pode ser negativo.`)
    .max(100_000, `${label} excede o limite permitido.`);

export const apiUsageUpdateSchema = z
  .object({
    dailyCostLimit: costLimit('Limite diário').optional(),
    monthlyCostLimit: costLimit('Limite mensal').optional(),
    apiPaused: z.boolean().optional(),
    nearbyRadiusKm: z.coerce.number().int().min(1).max(100).optional(),
    whatsappTemplate: requiredText('Template de WhatsApp', 2000).optional(),
    resetCosts: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const apiUsageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Ferramentas externas ───────────────────────────────────────────────────

export const cepQuerySchema = z.object({
  cep: z
    .string({ message: 'CEP é obrigatório.' })
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'CEP deve ter 8 dígitos.'),
});

export const cnpjQuerySchema = z.object({
  cnpj: z
    .string({ message: 'CNPJ é obrigatório.' })
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos.'),
});

export const nearbyQuerySchema = z.object({
  lat: requiredCoordinate('Latitude', 90),
  lng: requiredCoordinate('Longitude', 180),
  radius: z.coerce.number().min(0.1).max(100).optional(),
});

// ─── Importação em massa ────────────────────────────────────────────────────

/** Teto de linhas por lote — mantém a transação curta e o payload previsível. */
export const MAX_IMPORT_ROWS = 1000;

/** Teto do arquivo de planilha aceito no upload. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const customerImportRowSchema = z.object({
  tradeName: requiredText('Nome fantasia', 200),
  legalName: text(200),
  cnpj: onlyDigits('CNPJ', [14]),
  phone: text(40),
  mobile: text(40),
  email: optionalEmail(),
  address: requiredText('Endereço', 255),
  number: text(20),
  complement: text(120),
  neighborhood: requiredText('Bairro', 120),
  city: z.string().trim().min(1).max(120).default('Rio de Janeiro'),
  state: z.string().trim().min(2).max(2).default('RJ'),
  zipCode: onlyDigits('CEP', [8]),
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
  category: requiredText('Categoria', 120),
  notes: text(2000),
  googlePlaceId: text(255),
});

export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;

export const customerImportSchema = z.object({
  action: z.enum(['preview', 'commit'], { message: 'Ação inválida.' }),
  rows: z
    .array(z.unknown())
    .min(1, 'Nenhuma linha enviada para importação.')
    .max(MAX_IMPORT_ROWS, `Importe no máximo ${MAX_IMPORT_ROWS} linhas por vez.`),
});

/**
 * Linha de cliente vinda de planilha, já com as colunas normalizadas pela rota.
 * Mais frouxa que o lote JSON: a planilha do ERP antigo não traz coordenada
 * nem categoria, e a rota preenche o que falta.
 */
export const importedCustomerSchema = z.object({
  tradeName: requiredText('Nome fantasia', 200),
  legalName: text(200),
  cnpj: onlyDigits('CNPJ', [14]),
  cpf: onlyDigits('CPF', [11]),
  phone: text(40),
  address: requiredText('Endereço', 255),
  number: text(20),
  complement: text(120),
  neighborhood: requiredText('Bairro', 120),
  zipCode: onlyDigits('CEP', [8]),
});

export type ImportedCustomer = z.infer<typeof importedCustomerSchema>;

/** Linha de produto vinda de planilha, com as colunas já normalizadas. */
export const importedProductSchema = z.object({
  name: requiredText('Descrição', 200),
  barCode: text(40),
  internalCode: text(40),
  description: text(2000),
  category: z.string().trim().min(1).max(120).default('Geral'),
  type: z.enum(['venda', 'insumo']).default('venda'),
  unit: z.string().trim().min(1).max(20).default('un'),
  tags: text(255),

  salePrice: money('Preço de venda'),
  wholesalePrice: money('Preço de atacado'),
  priceFrom: money('Preço "de"'),
  priceTo: money('Preço "por"'),
  cost: money('Custo'),

  minWholesaleQty: quantity('Quantidade mínima de atacado'),
  stock: quantity('Estoque'),
  minStock: quantity('Estoque mínimo'),
  weightKg: quantity('Peso'),
  heightCm: money('Altura'),
  widthCm: money('Largura'),
  depthCm: money('Profundidade'),

  trackStock: z.boolean(),
  active: z.boolean(),
});

export type ImportedProduct = z.infer<typeof importedProductSchema>;

/** Uma linha rejeitada na importação, devolvida ao operador para correção. */
export interface ImportIssue {
  linha: number;
  motivo: string;
}

export interface ImportSummary {
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: ImportIssue[];
}
