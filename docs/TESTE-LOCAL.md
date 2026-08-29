# Testar no localhost

Roteiro para subir o sistema na sua máquina e conferir se está tudo de pé.
Leva uns 10 minutos.

---

## 1. Subir

```bash
cd prigor-os

npm install
npm run env:init      # cria o .env já com JWT_SECRET gerado
npm run db:up         # Postgres no Docker
npx prisma generate   # gera o client do Prisma
npm run db:deploy     # cria as 21 tabelas
npm run db:seed:demo  # popula o cenário de teste
npm run dev
```

Abra <http://localhost:3000>.

> `npm run env:init` gera o segredo de sessão sozinho. Se preferir fazer à
> mão, copie `.env.example` para `.env` e preencha `JWT_SECRET` com o
> resultado de `openssl rand -hex 32` — abaixo de 32 caracteres a aplicação
> se recusa a subir, de propósito.

Antes de subir, o `npm run dev` confere o `.env` e avisa se faltar alguma
coisa, em vez de deixar virar erro no navegador.

### Se a porta 5432 estiver ocupada

O container antigo (`prigor-db`) provavelmente ainda está rodando. Derrube-o:

```bash
docker stop prigor-db 2>/dev/null; docker rm prigor-db 2>/dev/null
npm run db:up
```

### Antes de tudo, o teste que não precisa de banco

```bash
npm run verify
```

Tipos, uso do Prisma contra o schema, lint e os 54 testes de regra de negócio.
Se isso passar, o núcleo está íntegro.

---

## 2. Usuários de teste

| Papel | E-mail | Senha |
|---|---|---|
| Administrador | `admin@prigor.local` | `demo12345678` |
| Vendedor | `vendedor@prigor.local` | `demo12345678` |

---

## 3. Roteiro de verificação

Os itens marcados com **★** são os que exercitam código que mudou de
comportamento ou que corrigiu bug — se algo estiver quebrado, é mais provável
que esteja aqui.

### Acesso

- [ ] Login com senha errada dá "E-mail ou senha inválidos" (sem dizer se o
      e-mail existe)
- [ ] **★** Errar a senha 11 vezes seguidas passa a responder "muitas
      tentativas" — o limite é por IP
- [ ] Login como vendedor cai em `/seller/dashboard`; como admin, em
      `/admin/dashboard`
- [ ] **★** Logado como vendedor, digitar `/admin/dashboard` na barra de
      endereço redireciona de volta — não abre a área de gestão

### Catálogo e ficha técnica

- [ ] **Produtos** lista os 3 brownies/cookies com custo já calculado
- [ ] Abrir "Brownie recheado" mostra a ficha técnica com 6 insumos
- [ ] **★** Editar só o preço de venda e salvar **não zera o custo** nem apaga
      a ficha técnica *(esse era o bug que zerava custo em silêncio)*
- [ ] **Matéria-prima** lista os 6 insumos
- [ ] Tentar arquivar um insumo que está em ficha técnica é recusado com
      mensagem explicando

### Pedido — o caminho mais importante

- [ ] Anote o estoque atual de "Chocolate meio amargo" e de "Brownie
      tradicional"
- [ ] Criar pedido: cliente **Lanchonete da Esquina**, 10× Brownie
      tradicional, status **confirmado**
- [ ] **★** Volte em Matéria-prima: o chocolate baixou **0,6 kg**
      (10 × 0,060) e os outros insumos também *(a baixa por ficha técnica
      nunca funcionou no sistema antigo)*
- [ ] O estoque do brownie baixou 10 unidades
- [ ] **★** Em **Financeiro** apareceu uma conta a receber com o valor do
      pedido
- [ ] **★** Volte ao pedido, mude a quantidade para 20 e salve — a conta a
      receber **atualizou o valor** *(antes ficava congelada no valor antigo)*
- [ ] **★** Baixe essa conta no financeiro e tente alterar o pedido de novo:
      deve recusar, pedindo para estornar a baixa primeiro
- [ ] Estornar a baixa libera a alteração
- [ ] Cancelar o pedido devolve o estoque e remove a conta a receber pendente

### Preço e comissão

- [ ] Pedido para **Padaria Imperial** (revendedor) puxa preço de atacado
      automaticamente
- [ ] Pedido para **Café do Ponto** com 30 cookies também puxa atacado — a
      quantidade atingiu o mínimo
- [ ] **★** Crie um pedido com frete de R$ 500. A comissão **não** aumenta por
      causa do frete *(mudança deliberada — veja `docs/DECISOES.md`, item 4)*
- [ ] **★** O "Cookie de chocolate" tem comissão 0% cadastrada: itens dele não
      geram comissão, mesmo o vendedor tendo 5%
- [ ] Marcar um pedido como **faturado** cria a conta a pagar da comissão

### Estoque e scanner de produção

Menu **Scanner de Produção** (`/admin/stock`). Essa tela existia no sistema
antigo e não tinha sido portada — foi reconstruída.

- [ ] Escolher a operação com as teclas `1` a `4` e confirmar com `Enter`
- [ ] Digitar `7890000000017` (código do Brownie tradicional) e dar Enter:
      mostra nome, unidade e saldo atual
- [ ] Confirmar a quantidade grava o movimento e mostra saldo antes → depois
- [ ] O foco volta sozinho para o campo de código, sem clique
- [ ] **★** Baixa de 999 kg de chocolate é recusada por saldo insuficiente
      *(antes o estoque ia a negativo em silêncio)*
- [ ] Código inexistente mostra erro legível, sem travar a tela
- [ ] `Esc` reinicia e volta para a escolha de operação
- [ ] O histórico do dia lista os movimentos com saldo antes e depois

### Isolamento por vendedor

- [ ] **★** Saia e entre como **vendedor**. Em "Meus Clientes" e "Meus
      Pedidos" ele vê apenas a carteira dele *(antes via a base inteira)*
- [ ] **★** Criar um pedido pela tela do vendedor: o pedido sai **com o
      vendedor preenchido** e com comissão *(antes saía sem vendedor)*
- [ ] Cadastrar cliente pela tela do vendedor: **o telefone é salvo**
      *(antes era descartado)*

### Documento

- [ ] Gerar o PDF de um pedido abre um documento com cabeçalho da empresa,
      itens, totais e observações

### CRM

- [ ] **Leads** lista os 3 leads do seed com score
- [ ] **★** Rodar a prospecção gera leads com `[SIMULADO]` no nome
      *(com `ALLOW_MOCK_PLACES=true`; sem a flag, ela recusa rodar)*
- [ ] **Regiões** e **Bairros** carregam e permitem editar

### Saúde

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","database":"ok",...}
```

---

## 4. Se algo quebrar

O log do `npm run dev` sai em JSON, uma linha por evento. Erro inesperado
aparece na tela com um código curto; procure por ele no terminal:

```bash
# a tela mostrou: "informe o código a1b2c3d4"
# procure no terminal do npm run dev por a1b2c3d4
```

A linha de log traz a rota, a mensagem real e o stack.

Se der erro **antes de subir**:

| Mensagem | Causa |
|---|---|
| `Configuração inválida: JWT_SECRET...` | Falta o segredo no `.env`, ou tem menos de 32 caracteres |
| `MISCONFIGURED` no navegador | Mesma causa: `JWT_SECRET` vazio. Rode `npm run check:env` — ele diz exatamente o que falta |
| `Can't reach database server` | O Postgres não subiu: `docker compose ps` |
| `@prisma/client did not initialize` | Faltou `npx prisma generate` |
| `The table ... does not exist` | Faltou `npm run db:deploy` |

---

## 5. Recomeçar do zero

```bash
npm run db:reset        # apaga tudo e reaplica as migrations
npm run db:seed:demo
```
