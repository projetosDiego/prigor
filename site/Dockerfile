# ============================================================================
#  Site oficial Doces Prigor — imagem de produção
#
#  Mesmo desenho da imagem do ERP: build multi-stage, saída standalone do Next,
#  usuário sem privilégio. O banco é SQLite e mora no volume /data, junto com
#  as imagens enviadas pelo painel — a imagem em si não guarda nada.
# ============================================================================

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Endereços públicos entram no JavaScript do navegador, então são definidos no build.
ARG NEXT_PUBLIC_SITE_URL=https://docesprigor.com.br
ARG NEXT_PUBLIC_APP_URL=https://app.docesprigor.com.br
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# O build gera páginas a partir do banco. Aqui ele usa um banco descartável,
# montado com as migrations e a carga inicial; o banco de verdade fica no volume.
ENV DATABASE_URL="file:/app/data/build.db"
ENV SESSION_SECRET="placeholder-de-build-com-mais-de-32-caracteres"
RUN mkdir -p data \
 && npx prisma generate \
 && npx prisma migrate deploy \
 && node docker/carga-inicial.mjs
RUN npm run build
RUN node docker/collect-prisma-cli.mjs

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl curl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/prigor.db"
ENV UPLOAD_DIR="/data/uploads"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs \
 && mkdir -p /data/uploads && chown -R nextjs:nodejs /data /app

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /prisma-cli/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/docker ./docker
RUN chmod +x ./docker/entrypoint.sh

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "server.js"]
