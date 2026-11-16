/**
 * Gera as imagens do site a partir das fotografias originais da marca.
 *
 * As originais (4–15 MB cada) ficam fora do repositório. Aqui saem versões
 * WebP com no máximo 2000 px no lado maior — o next/image ainda gera AVIF/WebP
 * no tamanho exato de cada tela a partir delas.
 *
 * Uso: npm run images -- "C:/caminho/das/fotos"
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] ?? 'C:/Users/igorc/OneDrive/Desktop/Doces Prigor';
const OUT = path.resolve('public/images');

// nome final (sem extensão) → arquivo original
const MAP = {
  'brownie-recheado-corte': 'Doces Prigor-35.jpg',
  'brownie-recheado-empilhado': 'brownies-stack.jpg',
  'brownie-oreo-corte': 'Doces Prigor-32.jpg',
  'brownies-embalados-laco': 'Doces Prigor-67.jpg',
  'expositor-brownies': 'brownies-box.jpg',
  'expositor-balcao': 'Doces Prigor2-40.jpg',
  'expositor-na-mao': 'Doces Prigor2-41.jpg',
  'brownie-supremo': 'Doces Prigor2-107.jpg',
  'brownie-supremo-horizontal': 'Doces Prigor2-104.jpg',
  'brownie-cobertura-doce-de-leite': 'Doces Prigor-49.jpg',
  'brownies-cobertura-dupla': 'Doces Prigor-55.jpg',
  'brownie-camadas-morango': 'Doces Prigor2-102.jpg',
  'brownie-tiras-cremes': 'Doces Prigor-109.jpg',
  'brownie-mergulho-creme': 'Doces Prigor-111.jpg',
  'brownie-bites': 'Doces Prigor-133.jpg',
  'copo-intenso': 'Doces Prigor-98.jpg',
  'copo-intenso-colher': 'Doces Prigor-106.jpg',
  'copo-intenso-mao': 'Doces Prigor-93.jpg',
  'copo-camadas': 'Doces Prigor2-120.jpg',
  'pote-dos-sonhos': 'Doces Prigor2-12.jpg',
  'pote-dos-sonhos-trio': 'Doces Prigor2-3.jpg',
  'pote-dos-sonhos-maos': 'Doces Prigor2-32.jpg',
  'pote-dos-sonhos-frutas-vermelhas': 'Doces Prigor2-20.jpg',
  'pote-dos-sonhos-calda': 'Doces Prigor2-29.jpg',
  'brigadeiros-sortidos': 'Doces Prigor-119.jpg',
  'brigadeiro-coco': 'Doces Prigor-124.jpg',
  'brigadeiros-avela': 'Doces Prigor-129.jpg',
  'mini-bolo-brownie': 'Doces Prigor-5.jpg',
  'bolo-brownie': 'Doces Prigor-7.jpg',
  'mini-bolos-trio': 'Doces Prigor2-94.jpg',
  'coracao-brownie': 'Doces Prigor-166.jpg',
  'bombons-recheados': 'Doces Prigor2-80.jpg',
};

fs.mkdirSync(OUT, { recursive: true });

for (const [name, file] of Object.entries(MAP)) {
  const input = path.join(SRC, file);
  if (!fs.existsSync(input)) {
    console.warn(`[images] não encontrado: ${input}`);
    continue;
  }
  const output = path.join(OUT, `${name}.webp`);
  const info = await sharp(input)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toFile(output);
  console.log(`${name}.webp  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

// Logo: só remove a margem transparente — proporções e cores intocadas.
const LOGO = path.join(SRC, 'logo.png');
if (fs.existsSync(LOGO)) {
  const brand = path.resolve('public/brand');
  fs.mkdirSync(brand, { recursive: true });
  await sharp(LOGO).trim().png().toFile(path.join(brand, 'logo-doces-prigor.png'));
  await sharp(LOGO).trim().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.resolve('src/app/icon.png'));
  await sharp(LOGO).trim().resize(180, 180, { fit: 'contain', background: '#F6EFE6' })
    .png().toFile(path.resolve('src/app/apple-icon.png'));
  console.log('logo ok');
}

// Imagem de compartilhamento (Open Graph) 1200×630: foto real + logo, sem texto inventado.
const HERO = path.join(OUT, 'brownie-recheado-corte.webp');
const LOGO_TRIM = path.resolve('public/brand/logo-doces-prigor.png');
if (fs.existsSync(HERO) && fs.existsSync(LOGO_TRIM)) {
  const photo = await sharp(HERO).resize(640, 630, { fit: 'cover', position: 'centre' }).toBuffer();
  const logo = await sharp(LOGO_TRIM).resize(300, 264, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#2a1812' } })
    .composite([
      { input: logo, left: 130, top: 183 },
      { input: photo, left: 560, top: 0 },
    ])
    .jpeg({ quality: 86 })
    .toFile(path.resolve('public/og-doces-prigor.jpg'));
  console.log('og ok');
}
