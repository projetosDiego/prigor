# ============================================================================
#  Doces Prigor OS — imagem de produção
#
#  Build multi-stage: a imagem final não carrega toolchain nem código-fonte,
#  roda como usuário sem privilégio e usa o output standalone do Next, que
#  traz só as dependências realmente alcançadas pelo código.
#
#  Além do standalone, o runtime precisa destas coisas para as migrations:
#    prisma/                 schema + histórico de migrations
#    node_modules/.prisma    client gerado
#    node_modules/@prisma    client e engines (o schema-engine roda o deploy)
#    o CLI do Prisma com a árvore de dependências dele — ver
#    docker/collect-prisma-cli.mjs
#
#  O seed é pré-compilado para JavaScript no build, então o runtime não
#  precisa de tsx nem de TypeScript.
# ============================================================================

# ─── 1. Dependências ────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── 2. Build ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# O build do Next exige que estas variáveis existam, mas os valores reais só
# entram em tempo de execução. São descartáveis, presentes só para satisfazer
# a validação de configuração.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV JWT_SECRET="placeholder-de-build-com-mais-de-32-caracteres"
ENV GOOGLE_MAPS_API_KEY="placeholder-de-build"

RUN npx prisma generate
RUN npm run build

# Seed compilado e autocontido (só o client do Prisma fica externo, porque
# ele é resolvido do node_modules do runtime).
RUN ./node_modules/.bin/esbuild prisma/seed.ts \
      --bundle --platform=node --target=node22 --format=cjs \
      --external:@prisma/client \
      --outfile=prisma/seed.js

# CLI do Prisma + dependências dele, reunidos numa árvore só para o runtime.
RUN node docker/collect-prisma-cli.mjs

# ─── 3. Runtime ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl curl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /prisma-cli/node_modules ./node_modules

COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs
EXPOSE 3000

# O healthcheck consulta o banco de verdade: um processo que responde mas não
# fala com o Postgres não está saudável, e o deploy precisa saber disso.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
