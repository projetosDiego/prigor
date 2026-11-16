/**
 * Carga inicial do site: produtos e pontos de venda.
 *
 * Só preenche tabela VAZIA — nunca sobrescreve o que já foi cadastrado ou
 * editado pelo painel. Roda no build (banco descartável) e na primeira subida
 * do container (banco do volume /data).
 */
import fs from 'node:fs';
import prisma from '@prisma/client';

const { PrismaClient } = prisma;

const dados = JSON.parse(fs.readFileSync(new URL('./dados-iniciais.json', import.meta.url), 'utf8'));
const db = new PrismaClient();
const bool = (v) => v === true || v === 1;

try {
  if ((await db.product.count()) === 0) {
    await db.product.createMany({
      data: dados.Product.map((p) => ({ ...p, featured: bool(p.featured), forResale: bool(p.forResale), active: bool(p.active) })),
    });
    console.log(`[carga-inicial] ${dados.Product.length} produtos`);
  }
  if ((await db.pointOfSale.count()) === 0) {
    await db.pointOfSale.createMany({ data: dados.PointOfSale.map((p) => ({ ...p, active: bool(p.active) })) });
    console.log(`[carga-inicial] ${dados.PointOfSale.length} pontos de venda`);
  }
  for (const s of dados.Setting ?? []) {
    await db.setting.upsert({ where: { key: s.key }, create: { key: s.key, value: s.value }, update: {} });
  }
} finally {
  await db.$disconnect();
}
