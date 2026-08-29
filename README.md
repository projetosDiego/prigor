# Doces Prigor OS

Sistema único da Doces Prigor: ERP (produtos, pedidos, estoque, financeiro) e
CRM de expansão (prospecção, funil, território) na mesma aplicação, no mesmo
banco.

**Stack:** Next.js 16 · React 19 · TypeScript · Prisma · PostgreSQL 16 · Tailwind 4

---

## Como rodar (desenvolvimento)

Pré-requisitos: Node 22+, Docker.

```bash
npm run env:init              # cria o .env com JWT_SECRET já gerado
npm run db:up                 # sobe o Postgres em container
npm run setup                 # instala, gera o client, migra e cria o admin
npm run db:seed:demo          # opcional: cenário de teste com dados
npm run dev                   # http://localhost:3000
```

Roteiro completo de verificação em [`docs/TESTE-LOCAL.md`](docs/TESTE-LOCAL.md).


## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run verify` | Tipos + uso do Prisma + lint + testes. **Rode antes de todo commit.** |
| `npm run check:prisma` | Confere as consultas contra o `schema.prisma` sem subir banco |
| `npm run env:init` | Cria o `.env` com o segredo de sessão gerado |
| `npm run check:env` | Diz o que falta no `.env` |
| `npm run db:seed:demo` | Popula um cenário de teste (recusa em produção) |
| `npm run typecheck` | Só o TypeScript |
| `npm run test` | Testes das regras de negócio |
| `npm run test:coverage` | Testes com cobertura (mínimo 90% no domínio) |
| `npm run db:migrate` | Cria uma migration nova a partir do schema |
| `npm run db:deploy` | Aplica migrations pendentes (é o que roda em produção) |
| `npm run db:studio` | Navegador visual do banco |
| `npm run db:reset` | **Apaga tudo** e recria do zero |

## Estrutura

```
src/
├── app/
│   ├── admin/            Telas de gestão
│   ├── seller/           Telas do vendedor em campo
│   └── api/              Rotas HTTP — finas: validam, chamam o serviço, respondem
├── server/               Tudo que só roda no servidor
│   ├── domain/           REGRA DE NEGÓCIO PURA (sem banco, sem HTTP) — é aqui
│   │                     que moram cálculo de pedido, comissão, estoque, preço
│   ├── services/         Orquestração: transação, persistência, serialização
│   ├── validation/       Schemas zod de toda entrada
│   ├── http/             Erros, resposta padronizada, log, limite de tentativas
│   ├── auth/             Sessão, senha, guards de autorização
│   ├── db.ts             Cliente Prisma
│   └── env.ts            Configuração validada (falha no boot se estiver errada)
├── lib/                  Código compartilhado com o cliente
└── components/

prisma/
├── schema.prisma         Fonte única da verdade do banco
├── migrations/           Histórico versionado
└── seed.ts               Admin inicial + configuração padrão

tests/domain/             Testes da regra de negócio
docker/                   Entrypoint e nginx
docs/                     Decisões de arquitetura e guia de deploy
```

### A regra que sustenta o resto

**Regra de negócio mora em `src/server/domain/`, em função pura.** Nada ali
importa Prisma, Next ou HTTP: entra dado simples, sai dado simples. Por isso o
cálculo de um pedido é testável sem subir banco, e por isso o teste roda em
segundo.

Rota HTTP não calcula nada. Ela valida a entrada, chama um serviço e devolve.
Serviço orquestra: abre transação, lê e grava, chama o domínio para decidir.

## Autorização

Três papéis: `ADMIN`, `MANAGER`, `SELLER`.

O vendedor enxerga **apenas a própria carteira** — clientes, pedidos e leads
dele. Isso é aplicado no `where` de cada consulta via `sellerScope(session)` em
`src/server/auth/guard.ts`, não na tela. Uma consulta nova que esqueça o escopo
é um vazamento; use sempre o helper.

## Dinheiro

Valor monetário é `Decimal`, nunca `number`. As colunas são `DECIMAL(12,2)`, o
cálculo passa por `decimal.js` e o arredondamento é HALF_UP. `number` só
aparece na resposta da API, para o front formatar.

## Documentação

- [`docs/TESTE-LOCAL.md`](docs/TESTE-LOCAL.md) — subir na sua máquina e o
  roteiro de verificação
- [`docs/DECISOES.md`](docs/DECISOES.md) — por que o sistema é assim, o que
  mudou de comportamento e quais bugs foram corrigidos
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — subir na VPS, passo a passo
