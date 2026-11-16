import { z } from 'zod';

export const LEAD_STATUSES = ['NOVO', 'EM_CONTATO', 'NEGOCIACAO', 'CONVERTIDO', 'PERDIDO'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  EM_CONTATO: 'Em contato',
  NEGOCIACAO: 'Negociação',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
};

export const BUSINESS_TYPES = [
  'Padaria',
  'Cafeteria',
  'Mercado / Mercearia',
  'Restaurante / Lanchonete',
  'Loja de conveniência',
  'Empório / Loja de produtos',
  'Academia',
  'Escola / Cantina',
  'Outro',
] as const;

export const HOW_FOUND = ['Instagram', 'Indicação', 'Vi em um ponto de venda', 'Google', 'Outro'] as const;

const text = (max: number) => z.string().trim().max(max);

export const leadInputSchema = z.object({
  name: text(120).min(2, 'Informe seu nome.'),
  company: text(160).min(2, 'Informe o nome do estabelecimento.'),
  whatsapp: text(30).refine((v) => v.replace(/\D/g, '').length >= 10, 'Informe um WhatsApp com DDD.'),
  city: text(80).min(2, 'Informe a cidade.'),
  neighborhood: text(80).default(''),
  businessType: text(60).min(2, 'Selecione o tipo de estabelecimento.'),
  instagram: text(80).default(''),
  howFound: text(60).default(''),
  message: text(2000).default(''),
  consent: z.literal(true, { error: 'É preciso autorizar o contato.' }),
  // rastreamento
  source: text(80).default('quero-vender'),
  utmSource: text(120).default(''),
  utmMedium: text(120).default(''),
  utmCampaign: text(160).default(''),
  referrer: text(300).default(''),
  // honeypot: humanos não preenchem
  website: text(200).default(''),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
