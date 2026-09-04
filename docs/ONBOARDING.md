# Primeiro dia no projeto

Este arquivo é para quem está chegando agora e nunca viu o código. Do zero até
a aplicação rodando na sua máquina dá uns 20 minutos, e a maior parte é
download.

---

## 1. O que é isso aqui

Doces Prigor é uma fábrica de brownies e cookies que vende para lanchonetes,
padarias e cafés. Este sistema é o software que ela usa por dentro, e são duas
coisas na mesma aplicação:

- **ERP** — o que a fábrica produz e vende: produtos, ficha técnica (a receita
  de cada produto), estoque de matéria-prima, pedidos e o financeiro que sai
  desses pedidos.
- **CRM** — a parte de crescer: procurar clientes novos por região, acompanhar
  o funil e distribuir território entre os vendedores.

Tem três tipos de usuário: administrador, gerente e vendedor. O vendedor usa o
sistema em campo, no celular, e enxerga só a carteira dele.

É um aplicativo **Next.js 16** (React + TypeScript) que fala com um
**PostgreSQL** através do **Prisma**. Não existe backend separado: as rotas de
API são o próprio Next. Se você já mexeu com Next, o que muda é que a versão 16
tem diferenças em relação ao que a maioria dos exemplos na internet mostra —
tem um aviso sobre isso no `CLAUDE.md` da raiz.

---

## 2. Os acessos que você precisa

Antes de qualquer coisa, confirme com o Diego que você tem:

- [ ] Convite aceito no repositório `projetosDiego/prigor` no GitHub
- [ ] Uma chave SSH sua cadastrada na sua conta do GitHub

Se você nunca gerou uma chave SSH:

```bash
ssh-keygen -t ed25519 -C "seu@email.com"     # aceite os padrões
cat ~/.ssh/id_ed25519.pub                     # copie o conteúdo
```

Cole em GitHub → Settings → SSH and GPG keys → New SSH key. Para testar:

```bash
ssh -T git@github.com
```

Tem que responder alguma coisa com o seu usuário no meio. Se pedir senha ou
recusar, a chave não está cadastrada.

---

## 3. O que instalar

| | Por quê | Onde |
|---|---|---|
| **Node 22** | é a versão que o projeto usa; a 20 não roda | <https://nodejs.org> ou `nvm install 22` |
| **Docker Desktop** | o banco de desenvolvimento roda em container, não instalado na sua máquina | <https://www.docker.com/products/docker-desktop> |
| **Git** | já vem no macOS e no Linux | |

Tem um `.nvmrc` no projeto: se você usa nvm, `nvm use` dentro da pasta já
troca para a versão certa.

Depois de instalar o Docker Desktop, **abra ele** e espere ficar verde. Ele
não sobe sozinho.

---

## 4. Clonar e subir

```bash
git clone git@github.com:projetosDiego/prigor.git
cd prigor
npm run bootstrap
```

O `bootstrap` faz tudo: confere Node e Docker, cria o seu `.env` com o segredo
de sessão gerado, instala as dependências, sobe o Postgres em container, cria
as tabelas e popula um cenário de teste com produtos, clientes e pedidos.

Se ele parar no meio, a mensagem diz qual foi o problema e o que fazer. Pode
rodar de novo quantas vezes quiser — ele não apaga dado nem sobrescreve o seu
`.env`.

Depois:

```bash
npm run dev
```

E abra <http://localhost:3000>.

| Papel | E-mail | Senha |
|---|---|---|
| Administrador | `admin@prigor.local` | `demo12345678` |
| Vendedor | `vendedor@prigor.local` | `demo12345678` |

Entre com os dois. A tela do vendedor é bem diferente da do admin, e boa parte
das regras do sistema só faz sentido depois que você vê as duas.

---

## 5. O dia a dia

```bash
npm run dev              # servidor de desenvolvimento
npm run verify           # tipos + uso do Prisma + lint + testes
npm run db:studio        # navegador visual do banco, bom pra entender o modelo
npm run db:reset         # apaga o banco e recria do zero (só local)
```

**`npm run verify` antes de todo commit.** É a regra do projeto. Ele roda em
alguns segundos porque os testes de regra de negócio não sobem banco.

O `check:prisma` que roda dentro do verify confere as suas consultas contra o
`schema.prisma` sem precisar de banco — é o que pega campo que não existe e
nome de relação errado antes de virar erro em runtime.

---

## 6. Três coisas que o código não deixa você quebrar

Vale ler antes de escrever a primeira linha, porque são decisões que valem
para o projeto inteiro.

**Regra de negócio mora em `src/server/domain/`, em função pura.** Nada dentro
dessa pasta importa Prisma, Next ou HTTP: entra dado simples, sai dado simples.
Cálculo de pedido, comissão, preço e baixa de estoque estão todos ali. Uma rota
de API nunca calcula nada — ela valida a entrada, chama um serviço e responde;
o serviço abre a transação, lê e grava, e chama o domínio para decidir.

**Dinheiro é `Decimal`, nunca `number`.** As colunas são `DECIMAL(12,2)`, o
cálculo passa por `decimal.js` e o arredondamento é HALF_UP. `number` só
aparece na resposta da API, para o front formatar. Um `+` em cima de valor
monetário é bug.

**Vendedor só enxerga a carteira dele, e isso é aplicado na consulta.** Toda
query que traz cliente, pedido ou lead passa `sellerScope(session)` no `where`
(está em `src/server/auth/guard.ts`). Filtrar na tela não conta: uma consulta
nova que esquecer o escopo é vazamento de dado entre vendedores.

---

## 7. Onde está o resto

- [`README.md`](../README.md) — mapa das pastas e tabela de comandos
- [`docs/TESTE-LOCAL.md`](TESTE-LOCAL.md) — roteiro de conferência tela a
  tela, com os pontos onde o comportamento mudou de propósito
- [`docs/DECISOES.md`](DECISOES.md) — por que o sistema é assim, o que mudou
  em relação à versão antiga e quais bugs foram corrigidos
- [`docs/DEPLOY.md`](DEPLOY.md) — como sobe na VPS (você provavelmente não
  precisa disso na primeira semana)

Comece pelo `DECISOES.md` depois de rodar. Boa parte do que parece estranho no
código tem explicação lá.

---

## 8. Quando der errado

O `npm run dev` loga em JSON, uma linha por evento. Quando dá erro inesperado,
a tela mostra um código curto — procure esse código no terminal e a linha traz
a rota, a mensagem real e o stack.

| Mensagem | Causa |
|---|---|
| `Configuração inválida: JWT_SECRET...` | falta o segredo no `.env`, ou tem menos de 32 caracteres — rode `npm run check:env` |
| `Can't reach database server` | o Postgres não está de pé: `docker compose ps` |
| `@prisma/client did not initialize` | faltou `npx prisma generate` |
| `The table ... does not exist` | faltou `npm run db:deploy` |
| porta 5432 ocupada | tem outro Postgres rodando: `docker ps` e `lsof -i :5432` |

Se travar em algo que não está aqui, chama o Diego em vez de passar duas horas
nisso — o projeto é novo e tem canto que ninguém pisou ainda.

---

## Uma coisa que ainda não foi testada

A prospecção do CRM usa a API do Google Places. A chave real ainda não existe,
então o `.env` de desenvolvimento sobe com `ALLOW_MOCK_PLACES=true`: a
prospecção roda simulada e marca os leads gerados com `[SIMULADO]` no nome.
Isso é de propósito. Em produção a flag é recusada.
