/**
 * Cardápio de Natal — catálogo padrão.
 *
 * Produtos, descrições e preços tirados do cardápio de Natal 2025 da marca
 * (a linha de 2026 é a mesma). Preço em CENTAVOS — nunca float.
 * O painel (/admin/natal) pode mudar preço e ativar/desativar cada item sem
 * mexer no código; o `sku` é a chave que liga o item ao produto no ERP.
 */

export type NatalChannel = 'varejo' | 'empresa';

export type NatalItem = {
  sku: string;
  name: string;
  groupId: string;
  channel: NatalChannel;
  description: string;
  /** Tamanho ou peso aproximado, como aparece no cardápio */
  detail?: string;
  priceCents: number;
  image: string;
  imageAlt: string;
  /** Todas as fotos do produto, na ordem do carrossel (a primeira é a `image`) */
  gallery: string[];
  /** Posição da foto no carrossel para cada opção (ex.: cada recheio da guirlanda) */
  optionSlide?: Record<string, number>;
  /** Escolha obrigatória (recheio, sabor, versão) */
  option?: { label: string; values: string[] };
  /** Quantidade mínima por pedido (canal empresa) */
  minQty?: number;
  active: boolean;
};

export type NatalGroup = { id: string; title: string; subtitle: string; channel: NatalChannel };

export const NATAL_GROUPS: NatalGroup[] = [
  { id: 'guirlandas', title: 'Guirlandas de brownie', subtitle: 'O centro da mesa de Natal.', channel: 'varejo' },
  { id: 'tacas', title: 'Taças & Brownie Box', subtitle: 'Sobremesas de aproximadamente 1,5 kg para servir a família.', channel: 'varejo' },
  { id: 'presentes', title: 'Presentes que abraçam', subtitle: 'Para dar, levar e trocar no amigo oculto.', channel: 'varejo' },
  { id: 'naked', title: 'Mini Naked Brownie', subtitle: 'Bolinhos de brownie com cerca de 400 g.', channel: 'varejo' },
  { id: 'chocotone', title: 'Chocotone no pote', subtitle: 'Camadas de chocotone com recheio generoso.', channel: 'varejo' },
  { id: 'empresas', title: 'Para empresas', subtitle: 'Preços especiais para presentear equipes, clientes e parceiros.', channel: 'empresa' },
];

const RECHEIO = { label: 'Recheio', values: ['Ninho', 'Doce de leite', 'Chocolate'] };

export const NATAL_DEFAULT_ITEMS: NatalItem[] = [
  {
    sku: 'NATAL-GUIRLANDA-RED-VELVET',
    name: 'Guirlanda Red Velvet',
    groupId: 'guirlandas',
    channel: 'varejo',
    description: 'Brownie red velvet, com brigadeiro de cream cheese e frutas vermelhas.',
    detail: '23 cm de diâmetro',
    priceCents: 8500,
    image: '/images/natal/g-guirlanda-red-velvet-1.webp',
    gallery: ['/images/natal/g-guirlanda-red-velvet-1.webp', '/images/natal/g-guirlanda-red-velvet-2.webp', '/images/natal/g-guirlanda-red-velvet-3.webp', '/images/natal/g-guirlanda-red-velvet-4.webp'],
    imageAlt: 'Guirlanda Red Velvet com brigadeiro de cream cheese, morangos e frutas vermelhas',
    active: true,
  },
  {
    sku: 'NATAL-GUIRLANDA-MAJESTOSA',
    name: 'Guirlanda de Brownie Majestosa',
    groupId: 'guirlandas',
    channel: 'varejo',
    description: 'Guirlanda tradicional de chocolate, recheada com o brigadeiro de sua preferência e decoração natalina.',
    detail: '23 cm',
    priceCents: 7500,
    image: '/images/natal/g-guirlanda-23-1.webp',
    gallery: ['/images/natal/g-guirlanda-23-1.webp', '/images/natal/g-guirlanda-23-2.webp', '/images/natal/g-guirlanda-23-3.webp', '/images/natal/g-guirlanda-23-4.webp', '/images/natal/g-guirlanda-23-5.webp', '/images/natal/g-guirlanda-23-6.webp', '/images/natal/g-guirlanda-23-7.webp', '/images/natal/g-guirlanda-23-8.webp', '/images/natal/g-guirlanda-23-9.webp'],
    optionSlide: { Ninho: 3, 'Doce de leite': 0, Chocolate: 6 },
    imageAlt: 'Guirlanda de brownie de 23 cm com brigadeiro, nozes e laço vermelho',
    option: RECHEIO,
    active: true,
  },
  {
    sku: 'NATAL-GUIRLANDA-MINI',
    name: 'Mini Guirlanda de Brownie',
    groupId: 'guirlandas',
    channel: 'varejo',
    description: 'A guirlanda tradicional em versão individual, com o brigadeiro de sua preferência e decoração natalina.',
    detail: '10 cm',
    priceCents: 2500,
    image: '/images/natal/g-guirlanda-mini-1.webp',
    gallery: ['/images/natal/g-guirlanda-mini-1.webp', '/images/natal/g-guirlanda-mini-2.webp', '/images/natal/g-guirlanda-mini-3.webp', '/images/natal/g-guirlanda-mini-4.webp', '/images/natal/g-guirlanda-mini-5.webp'],
    imageAlt: 'Mini guirlandas de brownie com laços vermelhos',
    option: RECHEIO,
    active: true,
  },
  {
    sku: 'NATAL-TACA-UVA',
    name: 'Taça Uva',
    groupId: 'tacas',
    channel: 'varejo',
    description: 'Mousse de ninho, brownie, brigadeiro de ninho, uvas e brigadeiro de chocolate. Também na versão morango.',
    detail: 'Aprox. 1,5 kg',
    priceCents: 14500,
    image: '/images/natal/g-taca-uva-1.webp',
    gallery: ['/images/natal/g-taca-uva-1.webp', '/images/natal/g-taca-uva-2.webp', '/images/natal/g-taca-uva-3.webp', '/images/natal/g-taca-uva-4.webp', '/images/natal/g-taca-uva-5.webp'],
    imageAlt: 'Taça de brownie com mousse de ninho, uvas e brigadeiro de chocolate',
    option: { label: 'Versão', values: ['Uva', 'Morango'] },
    active: true,
  },
  {
    sku: 'NATAL-TACA-RED',
    name: 'Taça Red',
    groupId: 'tacas',
    channel: 'varejo',
    description: 'Mousse de ninho, brownie red velvet, brigadeiro de cream cheese e geleia de frutas vermelhas.',
    detail: 'Aprox. 1,5 kg',
    priceCents: 14500,
    image: '/images/natal/g-taca-red-1.webp',
    gallery: ['/images/natal/g-taca-red-1.webp', '/images/natal/g-taca-red-2.webp', '/images/natal/g-taca-red-3.webp', '/images/natal/g-taca-uva-5.webp'],
    imageAlt: 'Taça Red com brownie red velvet, mousse de ninho e frutas vermelhas',
    active: true,
  },
  {
    sku: 'NATAL-BROWNIE-BOX',
    name: 'Brownie Box',
    groupId: 'tacas',
    channel: 'varejo',
    description: 'Recheio cremoso de nozes acompanhado de um brownie macio e finalizado com doce de leite. Também no sabor maracujá com brigadeiro.',
    detail: 'Aprox. 1,5 kg',
    priceCents: 14500,
    image: '/images/natal/g-brownie-box-1.webp',
    gallery: ['/images/natal/g-brownie-box-1.webp', '/images/natal/g-brownie-box-2.webp', '/images/natal/g-brownie-box-3.webp', '/images/natal/g-brownie-box-4.webp'],
    imageAlt: 'Brownie Box com cobertura de doce de leite e selo Doces Prigor',
    option: { label: 'Sabor', values: ['Nozes com doce de leite', 'Maracujá com brigadeiro'] },
    active: true,
  },
  {
    sku: 'NATAL-MINI-ARVORE',
    name: 'Mini Árvore',
    groupId: 'presentes',
    channel: 'varejo',
    description: 'Caixa com 8 bombons de chocolate recheado em formato de árvore.',
    priceCents: 2500,
    image: '/images/natal/g-mini-arvore-1.webp',
    gallery: ['/images/natal/g-mini-arvore-1.webp', '/images/natal/g-mini-arvore-2.webp', '/images/natal/g-mini-arvore-3.webp', '/images/natal/g-mini-arvore-4.webp', '/images/natal/g-mini-arvore-5.webp'],
    imageAlt: 'Caixa com bombons de chocolate em formato de árvore de Natal',
    active: true,
  },
  {
    sku: 'NATAL-BOMBOM-BROWNIE',
    name: 'Bombom de Brownie',
    groupId: 'presentes',
    channel: 'varejo',
    description: 'Caixa com 2 bombons recheados com brownie e brigadeiro.',
    priceCents: 3500,
    image: '/images/natal/g-bombom-de-brownie-1.webp',
    gallery: ['/images/natal/g-bombom-de-brownie-1.webp', '/images/natal/g-bombom-de-brownie-2.webp', '/images/natal/g-bombom-de-brownie-3.webp', '/images/natal/g-bombom-de-brownie-4.webp'],
    imageAlt: 'Caixa de presente com dois bombons de brownie em formato de árvore',
    active: true,
  },
  {
    sku: 'NATAL-BROWNIE-NOZES',
    name: 'Brownie de Nozes',
    groupId: 'presentes',
    channel: 'varejo',
    description: 'O clássico brownie sem recheio na sua versão natalina, acompanhado de nozes.',
    priceCents: 1000,
    image: '/images/natal/g-brownie-de-nozes-1.webp',
    gallery: ['/images/natal/g-brownie-de-nozes-1.webp', '/images/natal/g-brownie-de-nozes-2.webp', '/images/natal/g-brownie-de-nozes-3.webp'],
    imageAlt: 'Brownie de nozes embalado para o Natal',
    active: true,
  },
  {
    sku: 'NATAL-NAKED-TRADICIONAL',
    name: 'Mini Naked Brownie Tradicional',
    groupId: 'naked',
    channel: 'varejo',
    description: 'Brownie de chocolate com recheio de doce de leite.',
    detail: 'Aprox. 400 g',
    priceCents: 3000,
    image: '/images/natal/g-naked-tradicional-1.webp',
    gallery: ['/images/natal/g-naked-tradicional-1.webp', '/images/natal/g-naked-tradicional-2.webp', '/images/natal/g-naked-tradicional-3.webp', '/images/natal/g-naked-tradicional-4.webp'],
    imageAlt: 'Mini naked brownie tradicional com doce de leite e morangos',
    active: true,
  },
  {
    sku: 'NATAL-NAKED-RED-VELVET',
    name: 'Mini Naked Brownie Red Velvet',
    groupId: 'naked',
    channel: 'varejo',
    description: 'Brownie red velvet recheado com brigadeiro de cream cheese e frutas vermelhas.',
    detail: 'Aprox. 400 g',
    priceCents: 3500,
    image: '/images/natal/g-naked-red-velvet-1.webp',
    gallery: ['/images/natal/g-naked-red-velvet-1.webp', '/images/natal/g-naked-red-velvet-2.webp', '/images/natal/g-naked-red-velvet-3.webp', '/images/natal/g-naked-tradicional-4.webp'],
    imageAlt: 'Mini naked brownie red velvet com morangos',
    active: true,
  },
  {
    sku: 'NATAL-CHOCOTONE-POTE',
    name: 'Chocotone no Pote',
    groupId: 'chocotone',
    channel: 'varejo',
    description: 'Camadas de chocotone com recheio generoso.',
    priceCents: 2800,
    image: '/images/natal/g-chocotone-1.webp',
    gallery: ['/images/natal/g-chocotone-1.webp', '/images/natal/g-chocotone-2.webp', '/images/natal/g-chocotone-3.webp', '/images/natal/g-chocotone-4.webp', '/images/natal/g-chocotone-5.webp', '/images/natal/g-chocotone-6.webp', '/images/natal/g-chocotone-7.webp', '/images/natal/g-chocotone-8.webp', '/images/natal/g-chocotone-9.webp'],
    optionSlide: { 'Pistache com frutas vermelhas': 1, 'Ninho com Nutella': 3, 'Brigadeiro de nozes': 5, 'Chocolate alpino': 7 },
    imageAlt: 'Potes de chocotone em camadas com diferentes recheios',
    option: { label: 'Sabor', values: ['Pistache com frutas vermelhas', 'Ninho com Nutella', 'Brigadeiro de nozes', 'Chocolate alpino'] },
    active: true,
  },
  {
    sku: 'NATAL-EMP-GUIRLANDA-23',
    name: 'Guirlanda de Brownie 23 cm',
    groupId: 'empresas',
    channel: 'empresa',
    description: 'A guirlanda tradicional de chocolate, recheada e com decoração natalina. Preço especial para empresas.',
    detail: '23 cm',
    priceCents: 6490,
    image: '/images/natal/g-guirlanda-23-1.webp',
    gallery: ['/images/natal/g-guirlanda-23-1.webp', '/images/natal/g-guirlanda-23-2.webp', '/images/natal/g-guirlanda-23-3.webp', '/images/natal/g-guirlanda-23-4.webp', '/images/natal/g-guirlanda-23-5.webp', '/images/natal/g-guirlanda-23-6.webp', '/images/natal/g-guirlanda-23-7.webp', '/images/natal/g-guirlanda-23-8.webp', '/images/natal/g-guirlanda-23-9.webp'],
    optionSlide: { Ninho: 3, 'Doce de leite': 0, Chocolate: 6 },
    imageAlt: 'Guirlanda de brownie de 23 cm com decoração natalina',
    option: RECHEIO,
    minQty: 10,
    active: true,
  },
  {
    sku: 'NATAL-EMP-MINI-GUIRLANDA',
    name: 'Mini Guirlanda de Brownie',
    groupId: 'empresas',
    channel: 'empresa',
    description: 'A versão individual da guirlanda, ideal para presentear cada pessoa da equipe. Preço especial para empresas.',
    detail: '10 cm',
    priceCents: 2200,
    image: '/images/natal/g-guirlanda-mini-1.webp',
    gallery: ['/images/natal/g-guirlanda-mini-1.webp', '/images/natal/g-guirlanda-mini-2.webp', '/images/natal/g-guirlanda-mini-3.webp', '/images/natal/g-guirlanda-mini-4.webp', '/images/natal/g-guirlanda-mini-5.webp'],
    imageAlt: 'Mini guirlandas de brownie para presente corporativo',
    option: RECHEIO,
    minQty: 10,
    active: true,
  },
  {
    sku: 'NATAL-EMP-BROWNIE-NOZES',
    name: 'Brownie com Nozes',
    groupId: 'empresas',
    channel: 'empresa',
    description: 'O brownie natalino com nozes, embalado para presente. Preço especial para empresas.',
    priceCents: 790,
    image: '/images/natal/g-brownie-de-nozes-1.webp',
    gallery: ['/images/natal/g-brownie-de-nozes-1.webp', '/images/natal/g-brownie-de-nozes-2.webp', '/images/natal/g-brownie-de-nozes-3.webp'],
    imageAlt: 'Brownies com nozes embalados para presente corporativo',
    minQty: 20,
    active: true,
  },
];
