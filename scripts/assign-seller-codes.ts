import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sellers = await prisma.seller.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('Vendedores encontrados:', sellers);

  let nextCode = 101;
  for (const s of sellers) {
    if (!s.code) {
      // Verifica se o código já existe
      while (sellers.some((other) => other.code === String(nextCode))) {
        nextCode++;
      }
      await prisma.seller.update({
        where: { id: s.id },
        data: { code: String(nextCode) },
      });
      console.log(`Atribuído código ${nextCode} ao vendedor "${s.name}"`);
      nextCode++;
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
