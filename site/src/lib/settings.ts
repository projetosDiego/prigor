import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import { db } from './db';

/**
 * Conteúdo e configurações editáveis pelo painel.
 *
 * Os valores padrão abaixo são o texto que vai ao ar enquanto o administrador
 * não altera nada. Eles NÃO contêm preços, números, prêmios, depoimentos ou
 * fatos históricos — só o que a marca já informou (nome, slogan, Instagram,
 * WhatsApp impresso nas embalagens) e textos de posicionamento.
 */

export type ContactSettings = {
  whatsapp: string;
  instagram: string;
  email: string;
  region: string;
  legalName: string;
  cnpj: string;
  address: string;
};

export type MessageSettings = {
  general: string;
  findPoint: string;
  reseller: string;
  product: string;
  leadFollowUp: string;
  point: string;
  catalog: string;
  natal: string;
};

export type Step = { title: string; text: string };
export type Faq = { question: string; answer: string };

export type ContentSettings = {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string;
  universeTitle: string;
  universeText: string;
  universePillars: Step[];
  productsTitle: string;
  productsText: string;
  desireTitle: string;
  sensoryPhrase2: string;
  sensoryPhrase3: string;
  desireText: string;
  brandTitle: string;
  brandText: string;
  aboutTitle: string;
  aboutLead: string;
  aboutParagraphs: string[];
  storyNextTitle: string;
  storyNextText: string;
  storyClosing: string;
  resellerTitle: string;
  resellerLead: string;
  resellerSteps: Step[];
  resellerConditions: string;
  resellerFaq: Faq[];
  findTitle: string;
  findLead: string;
};

export type IntegrationSettings = {
  ga4Id: string;
  gtmId: string;
  metaPixelId: string;
  crmWebhookUrl: string;
  crmWebhookSecret: string;
  instagramToken: string;
  /** Endereço do ERP que recebe os pedidos do site (…/api/public/site-orders) */
  erpOrdersUrl: string;
  /** Segredo compartilhado com o ERP (SITE_ORDERS_SECRET lá) */
  erpOrdersSecret: string;
};

export type Settings = {
  contact: ContactSettings;
  messages: MessageSettings;
  content: ContentSettings;
  integrations: IntegrationSettings;
};

export const DEFAULT_SETTINGS: Settings = {
  contact: {
    whatsapp: '5521979908138',
    instagram: 'docesprigor',
    email: 'contato@docesprigor.com.br',
    region: 'Rio de Janeiro, RJ',
    legalName: 'Doces Prigor',
    cnpj: '',
    address: '',
  },
  messages: {
    general: 'Olá! Vim pelo site da Doces Prigor e queria falar com vocês.',
    findPoint: 'Olá! Vim pelo site e quero saber onde encontrar Doces Prigor perto de mim.',
    reseller: 'Olá! Conheci a Doces Prigor pelo site e gostaria de saber mais sobre a revenda.',
    product: 'Olá! Vi o {produto} no site da Doces Prigor e quero saber onde encontrar.',
    leadFollowUp:
      'Olá! Acabei de enviar meu cadastro de revenda pelo site. Sou {nome}, da {empresa} ({cidade}).',
    point: 'Olá! Vi no site da Doces Prigor que vocês vendem os brownies. Vocês têm disponível hoje?',
    catalog: 'Olá! Vim pelo site e quero conhecer os outros produtos e sabores da Doces Prigor.',
    natal: 'Olá! Vi o cardápio de Natal no site da Doces Prigor e tenho uma dúvida.',
  },
  content: {
    heroEyebrow: 'A felicidade em forma de brownie.',
    heroTitle: 'Existe felicidade em cada pedaço.',
    heroSubtitle: 'Brownies feitos para transformar pequenos momentos em experiências inesquecíveis.',
    heroImage: '/images/hero-brownie.webp',
    universeTitle: 'Um mundo de felicidade em forma de brownie.',
    universeText: 'A Doces Prigor é especializada na produção de brownies artesanais, com destaque para os brownies recheados, preparados com ingredientes selecionados, variedade de sabores e atenção a cada detalhe. Unimos qualidade, sabor e apresentação para entregar produtos que conquistam os consumidores e fortalecem nossos parceiros comerciais. Atuamos principalmente com pontos de revenda, levando praticidade, qualidade e a felicidade em forma de brownie a cada vez mais pessoas.',
    universePillars: [
      { title: 'Sabor', text: 'Brownies recheados, sabores marcantes e combinações que conquistam na primeira mordida.' },
      { title: 'Apresentação', text: 'Produtos feitos para despertar o desejo antes mesmo da primeira mordida.' },
      { title: 'Cuidado', text: 'Produção artesanal, atenção aos detalhes e o mesmo padrão de qualidade em cada unidade.' },
    ],
    productsTitle: 'Conheça nossos produtos.',
    productsText: 'Do brownie recheado às sobremesas de colher: escolha o seu próximo momento favorito.',
    desireTitle: 'Olhar já dá vontade.',
    sensoryPhrase2: 'Seu próximo momento favorito começa aqui.',
    sensoryPhrase3: 'Tem coisas que não precisam de explicação. Basta experimentar.',
    desireText: 'Massa, recheio, chocolate. De perto, cada detalhe conta a mesma história.',
    brandTitle: 'Tudo começou com um sonho, e alguns brownies.',
    brandText: 'A Doces Prigor nasceu em 6 de março de 2024, a partir de uma ideia simples: produzir brownies para compartilhar com pessoas próximas. O que começou de maneira despretensiosa virou uma marca especializada em brownies artesanais, presente em diversos pontos de revenda.',
    aboutTitle: 'Tudo começou com um sonho, e alguns brownies.',
    aboutLead: 'A Doces Prigor nasceu em 6 de março de 2024, a partir de uma ideia simples: produzir brownies para compartilhar com pessoas próximas e transformar uma paixão em uma oportunidade de construir algo próprio.',
    aboutParagraphs: [
      'O que começou de maneira despretensiosa logo ganhou novos caminhos. Nossos brownies começaram a conquistar as pessoas, o interesse pelos produtos cresceu e as primeiras oportunidades de revenda surgiram. A cada novo cliente e parceiro, percebíamos que estávamos construindo algo muito maior do que imaginávamos.',
      'Com o crescimento da marca e o aumento dos pontos de revenda, veio também uma decisão importante: dedicar nossos esforços integralmente à Doces Prigor. O que começou como um pequeno projeto se transformou em um negócio em constante desenvolvimento.',
      'Hoje, somos uma marca especializada em brownies artesanais, com destaque para os brownies recheados e uma variedade de sabores que conquistam consumidores e fortalecem parcerias comerciais. Trabalhamos diariamente para manter a qualidade, o cuidado e a apresentação que fazem parte da nossa identidade.',
    ],
    storyNextTitle: 'Nosso próximo capítulo',
    storyNextText:
      'Nossa história ainda está sendo escrita. Nosso maior sonho é levar a Doces Prigor cada vez mais longe, conquistar novos mercados e alcançar o maior número possível de pontos de revenda, fazendo nossos brownies chegarem a cada vez mais pessoas.',
    storyClosing: 'Porque, desde o primeiro dia, nosso propósito continua o mesmo:',
    resellerTitle: 'Seu negócio merece ter Doces Prigor.',
    resellerLead:
      'Leve brownies que conquistam pelo sabor e pela apresentação para dentro do seu estabelecimento. Seja nosso parceiro e ofereça aos seus clientes a felicidade em forma de brownie.',
    resellerSteps: [
      { title: 'Você envia o cadastro', text: 'Leva menos de dois minutos. Queremos entender o seu negócio antes de qualquer coisa.' },
      { title: 'A gente conversa', text: 'Nossa equipe entra em contato pelo WhatsApp para apresentar os produtos e as condições comerciais.' },
      { title: 'Montamos o seu mix', text: 'Definimos juntos quais produtos fazem sentido para o seu público e como será o abastecimento.' },
      { title: 'Prigor no seu balcão', text: 'Seu estabelecimento passa a aparecer na página Onde Encontrar do nosso site.' },
    ],
    resellerConditions: '',
    resellerFaq: [
      {
        question: 'Quais são as condições comerciais?',
        answer:
          'As condições são apresentadas no primeiro contato, de acordo com o perfil e a localização do seu estabelecimento.',
      },
      {
        question: 'Que tipo de estabelecimento pode revender?',
        answer:
          'Padarias, cafeterias, mercados, restaurantes, lojas de conveniência, empórios e outros negócios. Envie o cadastro e avaliamos juntos.',
      },
      {
        question: 'Em quais regiões vocês atendem?',
        answer: 'Informe sua cidade e bairro no cadastro — respondemos se atendemos a sua região e como funciona a entrega.',
      },
    ],
    findTitle: 'Tem um Prigor pertinho de você.',
    findLead: 'Busque por CEP, bairro ou cidade e veja os pontos de venda mais próximos — ou consulte a disponibilidade pelo WhatsApp.',
  },
  integrations: {
    ga4Id: '',
    gtmId: '',
    metaPixelId: '',
    crmWebhookUrl: '',
    crmWebhookSecret: '',
    instagramToken: '',
    erpOrdersUrl: '',
    erpOrdersSecret: '',
  },
};

export const SETTINGS_TAG = 'settings';

function merge<T extends Record<string, unknown>>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object') return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (!(key in base)) continue;
    const baseValue = base[key];
    if (Array.isArray(baseValue)) {
      if (Array.isArray(value)) out[key] = value;
    } else if (typeof baseValue === 'string') {
      if (typeof value === 'string') out[key] = value;
    } else if (baseValue && typeof baseValue === 'object') {
      out[key] = merge(baseValue as Record<string, unknown>, value);
    }
  }
  return out as T;
}

const loadSettings = unstable_cache(
  async (): Promise<Settings> => {
    const rows = await db.setting.findMany();
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value);
      } catch {
        /* valor corrompido: cai no padrão */
      }
    }
    return merge(DEFAULT_SETTINGS, stored);
  },
  ['site-settings'],
  { tags: [SETTINGS_TAG], revalidate: 3600 },
);

export const getSettings = cache(loadSettings);

export async function saveSettingsGroup<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const clean = merge(DEFAULT_SETTINGS[key] as Record<string, unknown>, value) as Settings[K];
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(clean) },
    update: { value: JSON.stringify(clean) },
  });
}

/** Dados públicos (sem segredos) para componentes do cliente. */
export type PublicConfig = {
  whatsapp: string;
  instagram: string;
  messages: MessageSettings;
  ga4Id: string;
  gtmId: string;
  metaPixelId: string;
};

export function toPublicConfig(s: Settings): PublicConfig {
  return {
    whatsapp: s.contact.whatsapp,
    instagram: s.contact.instagram,
    messages: s.messages,
    ga4Id: s.integrations.ga4Id,
    gtmId: s.integrations.gtmId,
    metaPixelId: s.integrations.metaPixelId,
  };
}
