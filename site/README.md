# Doces Prigor — Site oficial

> A felicidade em forma de brownie.

Site institucional e de conversão da Doces Prigor: desejo pelo produto, localização
dos pontos de venda, captação de revendedores e painel administrativo.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma · SQLite (troca para PostgreSQL sem mudar código)

---

## Rodar localmente

Pré-requisito: Node 22+.

```bash
npm install
cp .env.example .env          # preencha ADMIN_EMAIL, ADMIN_PASSWORD e SESSION_SECRET
npx prisma migrate deploy     # cria o banco em data/prigor.db
npm run db:seed               # cadastra os produtos informados pela marca
npm run dev                   # http://localhost:3000  ·  painel em /admin
```

`SESSION_SECRET`: gere com `openssl rand -hex 32`. `ADMIN_PASSWORD`: mínimo 12 caracteres.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` / `npm run lint` | Verificações |
| `npm run db:seed` | Cria os produtos iniciais (idempotente, não sobrescreve) |
| `npm run images -- "C:/pasta/das/fotos"` | Regera as imagens otimizadas a partir das fotos originais |

## Páginas

| Rota | Conteúdo |
|---|---|
| `/` | Primeira tela (os dois caminhos), Universo, vitrine interativa de produtos, experiência sensorial, onde encontrar, história, revenda, Instagram |
| `/nossa-historia` | História da marca em capítulos (texto editável no painel) |
| `/produtos`, `/produtos/[slug]` | Catálogo por categoria e página de cada produto |
| `/natal2026` | Cardápio de Natal com carrinho, finalização (`/natal2026/finalizar`) e página do pedido com Pix |
| `/onde-encontrar` | Localizador: busca por CEP, bairro, cidade ou nome, “usar minha localização”, mapa, rota e WhatsApp |
| `/pontos-de-venda/[slug]` | Página de cada ponto |
| `/seja-um-revendedor` | Jornada B2B: apresentação, por que revender, perfil dos parceiros, como funciona, formulário, FAQ |
| `/contato` | Contato por assunto |
| `/politica-de-privacidade`, `/termos-de-uso` | Legais (LGPD) |
| `/admin` | Painel (protegido) |

`/sobre` e `/quero-vender` (endereços do site anterior) redirecionam para as páginas novas.

## Cardápio de Natal e pedidos pelo site

- Catálogo padrão em `src/lib/natal/catalog.ts` (preço em centavos, `sku` = chave no ERP). Preço, disponibilidade,
  datas, pontos de retirada, sinal, desconto e chave Pix são editados no painel em **Natal**.
- Regras puras: `src/lib/natal/pricing.ts` (12% a partir de 10 unidades do mesmo produto; itens de empresa sem desconto
  e com mínimo), `dates.ts` (antecedência, período, dias fechados), `src/lib/pix.ts` (Pix copia e cola com valor).
- O preço é sempre recalculado no servidor (`src/lib/orders/service.ts`); o carrinho do navegador só informa itens e quantidades.
- Pedido gravado na tabela `ShopOrder` (painel → **Pedidos**) e enviado ao Doces Prigor OS assinado com HMAC
  (`src/lib/orders/erp.ts`). Se o ERP estiver fora, fica marcado e é reenviado (botão no painel ou no próximo pedido).
  Configuração em Configurações → ERP. Lado do ERP: `prigor/docs/PEDIDOS-DO-SITE.md`.
- O link da página do pedido leva um token (`src/lib/orders/token.ts`) para ninguém abrir pedido alheio trocando o número.

## Identidade visual e movimento

- **Paleta:** chocolate profundo `#24130F`, marrom cacau `#382019`, caramelo `#B77A45`, creme `#F3E9D8`, off-white `#FAF7F1`, dourado `#B99A65` — tokens em `src/app/globals.css`.
- **Tipografia:** Fraunces (títulos e frases de impacto em itálico) + Manrope (texto). Os arquivos ficam em `src/fonts/` e são servidos pelo próprio site.
- **Movimento:** sem biblioteca de animação. `src/components/site/Reveal.tsx` é o único runtime (revelações, parallax, luz que segue o cursor) e `src/components/site/motion.tsx` tem os blocos visuais (`Drip` — a transição de calda entre seções —, `Seal`, `Marquee`, `Lines`, `Words`). Tudo respeita `prefers-reduced-motion`.
- **Vitrine:** só entram nas vitrines produtos com foto. Produto sem foto continua no painel, mas não aparece no site.

## Painel `/admin`

- **Visão geral** — visitas, leads, cliques em WhatsApp / Quero experimentar / Quero vender, buscas de pontos, rotas, páginas mais vistas e origem (UTM) dos leads.
- **Leads** — lista com filtros (status, tipo, período, busca), alteração de status (Novo → Em contato → Negociação → Convertido/Perdido), anotações, WhatsApp em um clique, exportação CSV, exclusão (pedidos LGPD).
- **Produtos** — criar, editar, ativar/desativar, excluir, fotos (upload convertido para WebP), galeria, sabores, tamanho, destaque, ordem.
- **Pontos de venda** — criar, editar, ativar/desativar, excluir. Coordenadas são obtidas automaticamente pelo endereço (OpenStreetMap) ou pelo link do Google Maps.
- **Conteúdo** — textos da Home, Sobre, Onde encontrar e Quero vender (passos, condições, FAQ) e foto do banner.
- **Configurações** — WhatsApp, Instagram, e-mail, CNPJ, mensagens de WhatsApp por contexto, GA4/GTM/Meta Pixel, webhook de CRM, token do Instagram.

## Integrações

- **WhatsApp:** mensagens diferentes por contexto (geral, onde encontrar, revenda, produto, pós-cadastro, ponto de venda), editáveis no painel.
- **Analytics:** eventos padronizados em `src/lib/analytics.ts` → dataLayer (GTM), GA4, Meta Pixel e registro próprio no banco. Scripts de terceiros só carregam após consentimento de cookies.
- **CRM:** cada lead novo é enviado por POST JSON para o webhook configurado (assinatura HMAC opcional em `X-Prigor-Signature`).
- **Instagram:** sem token, a seção usa fotos oficiais com link para @docesprigor; com token da Instagram API, mostra os posts recentes (cache de 1 h).

## SEO

Metadados por página, Open Graph (`public/og-doces-prigor.jpg`), `sitemap.xml` e `robots.txt` dinâmicos,
dados estruturados (Organization, WebSite, BreadcrumbList, Product, Place, FAQPage), URLs amigáveis e alt text.
Defina `NEXT_PUBLIC_SITE_URL` com o domínio final.

## Produção

- `output: 'standalone'`: copie `.next/standalone`, `.next/static` (para `.next/static`) e `public/`.
- `data/` (banco SQLite e fotos enviadas pelo painel) precisa ser um **volume persistente**.
- Para PostgreSQL: troque o `provider` em `prisma/schema.prisma`, ajuste `DATABASE_URL` e rode `npx prisma migrate dev`.

## Fotografias

`public/images/` reúne as fotos oficiais da marca já tratadas e otimizadas em WebP.
As da sessão mais recente (`Fotos para o site`) receberam ajuste leve de contraste e cor, recortes macro
(`macro-*.webp`) e o recorte do brownie da primeira tela (`hero-brownie.webp`, fundo transparente).
Nenhuma imagem foi gerada por IA. O logo em `public/brand/` é o arquivo oficial.

## Pendências de informação (a preencher pela marca, via painel)

O site não inventa preços, pesos, ingredientes, depoimentos, números, datas ou pontos de venda. Falta:

1. **Pontos de venda** — importados da lista de clientes do ERP (só nome, rua e bairro). Confira as cidades deduzidas pelo bairro e use “Localizar no mapa” no painel.
2. **Confirmar as fotos de cada produto**, em especial Classic Prigor e Brownie Supremo, e a foto usada para o sabor de cada Brownie Recheado.
3. **História** — o texto segue o que a marca informou; revise e complete em Conteúdo → Nossa história.
4. **Tortas / mini tortas com o selo dourado** — aparecem como imagem de marca; se forem vendidas, cadastre como produto.
5. **CNPJ e razão social** no rodapé (Configurações), se quiser exibir.
6. **Condições comerciais de revenda**, se quiser publicá-las (Conteúdo → Seja um revendedor).
7. **Token do Instagram** (Configurações) para mostrar as publicações reais; sem ele a seção usa fotos oficiais com link para o perfil.
8. **IDs de GA4 / Meta Pixel** e **webhook do CRM**, quando existirem.
