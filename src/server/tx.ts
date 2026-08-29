/**
 * Cliente de transação.
 *
 * Dentro de `prisma.$transaction(fn)`, o `tx` NÃO é um `PrismaClient`
 * completo: o Prisma remove `$connect`, `$disconnect`, `$transaction`, `$on` e
 * `$extends`, porque aninhar transação ou desconectar no meio de uma não faz
 * sentido. Anotar o callback como `typeof prisma` compila contra um stub
 * permissivo e quebra no build de produção, onde os tipos reais existem —
 * foi exatamente o que derrubou o primeiro deploy.
 *
 * Use `Tx` em todo callback de transação e em toda função auxiliar que receba
 * um cliente transacional.
 */
import type { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;
