/**
 * Seed do catálogo — idempotente.
 *
 * Cria apenas os produtos informados pela marca. NÃO cria pontos de venda,
 * leads, preços, pesos nem ingredientes: essas informações entram pelo painel
 * /admin quando forem reais.
 *
 * Produtos que já foram editados pelo painel nunca são sobrescritos.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  size?: string;
  flavors?: string[];
  image?: string;
  gallery?: string[];
  imageAlt?: string;
  featured?: boolean;
};

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'brownie-recheado',
    name: 'Brownie Recheado',
    category: 'Brownies',
    tagline: 'O queridinho da casa, recheado de verdade.',
    description:
      'O brownie que virou a assinatura da Doces Prigor: recheio generoso, casquinha por cima e cinco sabores para escolher. Embalado individualmente, pronto para ir com você.',
    size: '7 × 5 cm',
    flavors: ['Ninho', 'Doce de Leite', 'Chocolate', 'Oreo', 'Morango'],
    image: '/images/brownie-recheado-camadas.webp',
    gallery: ['/images/brownie-recheado-empilhado.webp', '/images/expositor-brownies.webp'],
    imageAlt: 'Brownies recheados Doces Prigor empilhados, com o recheio cremoso aparente',
    featured: true,
  },
  {
    slug: 'dip-brownie',
    name: 'Dip Brownie',
    category: 'Brownies',
    tagline: 'Tem coisa melhor do que um brownie quentinho acompanhado de muito recheio? 🤎',
    description:
      'Na Doces Prigor, até a hora de mergulhar o brownie no recheio vira uma experiência especial! Crocante por fora, macio por dentro e acompanhado de muito chocolate para deixar cada mordida ainda mais irresistível.',
    image: '/images/classic-mergulho.webp',
    gallery: ['/images/classic-mergulho-mao.webp', '/images/macro-mergulho.webp', '/images/classic-tiras.webp'],
    imageAlt: 'Dip Brownie Doces Prigor sendo mergulhado no recheio de chocolate',
    featured: true,
  },
  {
    slug: 'pote-dos-sonhos',
    name: 'Pote dos Sonhos',
    category: 'Sobremesas',
    tagline: 'Sobremesa em camadas para comer de colher.',
    description: 'Camada sobre camada, no pote. É abrir, pegar a colher e ir até o fundo.',
    image: '/images/pote-dos-sonhos.webp',
    gallery: ['/images/pote-dos-sonhos-trio.webp', '/images/pote-dos-sonhos-frutas-vermelhas.webp', '/images/pote-dos-sonhos-calda.webp'],
    imageAlt: 'Pote dos Sonhos Doces Prigor com colher mostrando as camadas',
    featured: true,
  },
  {
    slug: 'copo-intenso',
    name: 'Copo Intenso',
    category: 'Sobremesas',
    tagline: 'Brownie e creme em camadas, servidos no copo.',
    description: 'Pedaços de brownie e camadas cremosas no copo. O nome já avisa.',
    image: '/images/copo-intenso.webp',
    gallery: ['/images/copo-intenso-colher.webp', '/images/copos-camadas.webp'],
    imageAlt: 'Copo Intenso Doces Prigor com camadas de brownie e creme',
    featured: true,
  },
  {
    slug: 'brownie-supremo',
    name: 'Brownie Supremo',
    category: 'Brownies',
    tagline: 'Cobertura generosa. Sem economia.',
    description: 'A versão mais indulgente do nosso brownie, com cobertura generosa e acabamento caprichado.',
    image: '/images/supremo-kinder.webp',
    gallery: ['/images/supremo-doce-de-leite.webp', '/images/supremos-dupla.webp', '/images/brownie-morango.webp'],
    imageAlt: 'Brownie Supremo com cobertura cremosa e fios de chocolate',
    featured: true,
  },
  {
    slug: 'brigadeiro-prigor',
    name: 'Brigadeiro Prigor',
    category: 'Doces',
    tagline: 'O brigadeiro com a assinatura Prigor.',
    description: 'Brigadeiros feitos com o mesmo cuidado dos nossos brownies.',
    image: '/images/brigadeiros-sortidos.webp',
    gallery: ['/images/brigadeiro-coco.webp', '/images/caixa-presente.webp'],
    imageAlt: 'Brigadeiros Prigor sortidos',
  },
];

/** Produtos que mudaram de endereço (slug antigo → novo). O cadastro é reaproveitado. */
const RENAMES: Record<string, string> = { 'classic-prigor': 'dip-brownie' };

async function main(): Promise<void> {
  for (const [from, to] of Object.entries(RENAMES)) {
    const [old, current] = await Promise.all([
      prisma.product.findUnique({ where: { slug: from } }),
      prisma.product.findUnique({ where: { slug: to } }),
    ]);
    if (old && !current) await prisma.product.update({ where: { slug: from }, data: { slug: to } });
  }

  let created = 0;
  let refreshed = 0;
  for (const [index, p] of PRODUCTS.entries()) {
    const data = {
      name: p.name,
      category: p.category,
      tagline: p.tagline,
      description: p.description,
      size: p.size ?? '',
      flavors: JSON.stringify(p.flavors ?? []),
      image: p.image ?? '',
      gallery: JSON.stringify(p.gallery ?? []),
      imageAlt: p.imageAlt ?? '',
      featured: p.featured ?? false,
      order: index + 1,
    };
    const exists = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (!exists) {
      await prisma.product.create({ data: { slug: p.slug, ...data } });
      created++;
    } else if (neverEdited(exists)) {
      // Veio do seed anterior e ninguém mexeu pelo painel: recebe o catálogo novo.
      await prisma.product.update({ where: { slug: p.slug }, data });
      refreshed++;
    }
  }
  console.log(`[seed] ${created} produto(s) criado(s), ${refreshed} atualizado(s); os demais foram editados no painel e ficaram como estão.`);
}

/** Produto que nunca foi alterado pelo painel (criado e atualizado no mesmo instante). */
function neverEdited(row: { createdAt: Date; updatedAt: Date }): boolean {
  return Math.abs(row.updatedAt.getTime() - row.createdAt.getTime()) < 5000;
}

main()
  .catch((error) => {
    console.error('[seed] falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
