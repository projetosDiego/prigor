-- ============================================================================
--  Doces Prigor OS — schema inicial
--
--  Migration única e limpa. Substitui o histórico anterior, que tinha o mesmo
--  desenho de tabelas declarado em dois lugares (Prisma e SQLAlchemy).
--
--  Pontos de atenção:
--   * Dinheiro é DECIMAL, nunca DOUBLE PRECISION.
--   * O número do pedido vem de uma SEQUENCE, não de MAX(numero)+1.
-- ============================================================================

-- ─── Tipos enumerados ───────────────────────────────────────────────────────

CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SELLER');

CREATE TYPE "PipelineStage" AS ENUM (
  'NOVO', 'QUALIFICADO', 'ATRIBUIDO', 'ABORDADO', 'CONTATO_REALIZADO',
  'INTERESSADO', 'REUNIAO', 'AMOSTRA', 'NEGOCIACAO', 'NOVO_REVENDEDOR', 'PERDIDO'
);

CREATE TYPE "LossReason" AS ENUM (
  'SEM_INTERESSE', 'PRECO', 'JA_POSSUI_FORNECEDOR', 'PRODUZ_INTERNAMENTE',
  'NAO_TRABALHA_COM_SOBREMESAS', 'BAIXO_MOVIMENTO', 'ESTABELECIMENTO_FECHADO',
  'CONTATO_INVALIDO', 'RESPONSAVEL_NAO_ENCONTRADO', 'OUTRO'
);

CREATE TYPE "ActivityType" AS ENUM (
  'VISIT', 'WHATSAPP', 'PHONE', 'MEETING', 'SAMPLE', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT'
);

CREATE TYPE "MeetingStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA', 'NAO_COMPARECEU');

CREATE TYPE "SampleResult" AS ENUM ('GOSTOU', 'INTERESSADO', 'PENSANDO', 'NAO_GOSTOU', 'SEM_INTERESSE');

CREATE TYPE "ProductType" AS ENUM ('venda', 'insumo');

CREATE TYPE "StockMovementType" AS ENUM ('baixa_insumo', 'entrada_recheio', 'entrada_produto', 'saida_venda');

CREATE TYPE "TransactionType" AS ENUM ('receita', 'despesa');

CREATE TYPE "TransactionStatus" AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');

CREATE TYPE "OrderStatus" AS ENUM ('novo', 'confirmado', 'em_producao', 'entregue', 'faturado', 'cancelado');

CREATE TYPE "PaymentMethod" AS ENUM ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia');

CREATE TYPE "ProspectingRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'SUCCESS_SIMULADO', 'FAILED');

-- ─── Acesso ─────────────────────────────────────────────────────────────────

CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "senha_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SELLER',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE INDEX "usuarios_ativo_idx" ON "usuarios"("ativo");

CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "meta" INTEGER NOT NULL DEFAULT 0,
    "comissao_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vendedores_usuario_id_key" ON "vendedores"("usuario_id");
CREATE INDEX "vendedores_ativo_idx" ON "vendedores"("ativo");

-- ─── Território ─────────────────────────────────────────────────────────────

CREATE TABLE "regioes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "regioes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regioes_nome_key" ON "regioes"("nome");

CREATE TABLE "bairros" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL DEFAULT 'Rio de Janeiro',
    "uf" TEXT NOT NULL DEFAULT 'RJ',
    "regiao_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bairros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bairros_nome_cidade_uf_key" ON "bairros"("nome", "cidade", "uf");
CREATE INDEX "bairros_regiao_id_idx" ON "bairros"("regiao_id");
CREATE INDEX "bairros_vendedor_id_idx" ON "bairros"("vendedor_id");

-- ─── Clientes e leads ───────────────────────────────────────────────────────

CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "apelido" TEXT NOT NULL,
    "nome" TEXT,
    "cnpj" TEXT,
    "cpf" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "categoria" TEXT,
    "vendedor_id" TEXT,
    "regiao_id" TEXT,
    "bairro_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "google_place_id" TEXT,
    "codigo_externo" TEXT,
    "tipo_lista" TEXT,
    "documento" TEXT,
    "rg" TEXT,
    "uf_rg" TEXT,
    "ie" TEXT,
    "ie_indicador" TEXT,
    "site" TEXT,
    "data_nascimento" DATE,
    "is_revendedor" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clientes_cnpj_key" ON "clientes"("cnpj");
CREATE UNIQUE INDEX "clientes_google_place_id_key" ON "clientes"("google_place_id");
CREATE INDEX "clientes_vendedor_id_idx" ON "clientes"("vendedor_id");
CREATE INDEX "clientes_ativo_idx" ON "clientes"("ativo");
CREATE INDEX "clientes_status_idx" ON "clientes"("status");
CREATE INDEX "clientes_apelido_idx" ON "clientes"("apelido");

CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "razao_social" TEXT,
    "cnpj" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "google_place_id" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "score_detalhes" JSONB,
    "vendedor_id" TEXT,
    "regiao_id" TEXT,
    "bairro_id" TEXT,
    "etapa_funil" "PipelineStage" NOT NULL DEFAULT 'NOVO',
    "origem" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "motivo_perda" "LossReason",
    "observacoes_perda" TEXT,
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "primeiro_contato_em" TIMESTAMP(3),
    "cliente_convertido_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leads_cnpj_key" ON "leads"("cnpj");
CREATE UNIQUE INDEX "leads_google_place_id_key" ON "leads"("google_place_id");
CREATE INDEX "leads_vendedor_id_idx" ON "leads"("vendedor_id");
CREATE INDEX "leads_etapa_funil_idx" ON "leads"("etapa_funil");
CREATE INDEX "leads_status_idx" ON "leads"("status");
CREATE INDEX "leads_score_idx" ON "leads"("score");
CREATE INDEX "leads_bairro_id_idx" ON "leads"("bairro_id");

CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT,
    "cliente_id" TEXT,
    "vendedor_id" TEXT,
    "tipo" "ActivityType" NOT NULL,
    "descricao" TEXT NOT NULL,
    "data_atividade" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "resultado" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "atividades_lead_id_idx" ON "atividades"("lead_id");
CREATE INDEX "atividades_cliente_id_idx" ON "atividades"("cliente_id");
CREATE INDEX "atividades_vendedor_id_data_atividade_idx" ON "atividades"("vendedor_id", "data_atividade");

CREATE TABLE "reunioes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "data_reuniao" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "observacao" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'AGENDADA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reunioes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reunioes_lead_id_idx" ON "reunioes"("lead_id");
CREATE INDEX "reunioes_vendedor_id_data_reuniao_idx" ON "reunioes"("vendedor_id", "data_reuniao");

CREATE TABLE "amostras" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "data_entrega" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produto" TEXT NOT NULL DEFAULT 'Brownie Recheado 7x5',
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "sabores" TEXT,
    "observacao" TEXT,
    "resultado" "SampleResult",
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "amostras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "amostras_lead_id_idx" ON "amostras"("lead_id");
CREATE INDEX "amostras_vendedor_id_idx" ON "amostras"("vendedor_id");

-- ─── Catálogo, estoque e receita ────────────────────────────────────────────

CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "codigo_barras" TEXT,
    "codigo_interno" TEXT,
    "nome" TEXT NOT NULL,
    "nome_loja" TEXT,
    "descricao" TEXT,
    "descricao_loja" TEXT,
    "categoria" TEXT,
    "subcategoria" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "tipo" "ProductType" NOT NULL DEFAULT 'venda',
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "preco_venda" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "preco_atacado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "qtd_min_atacado" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "preco_de" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "preco_por" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "custo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estoque" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "estoque_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "movimenta_estoque" BOOLEAN NOT NULL DEFAULT true,
    "ncm" TEXT,
    "cfop" TEXT,
    "origem" TEXT,
    "cest" TEXT,
    "peso_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "altura_cm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "largura_cm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profundidade_cm" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tags" TEXT,
    "garantia" TEXT,
    "itens_inclusos" TEXT,
    "especificacoes" TEXT,
    "imagem" TEXT,
    "comissao_pct" DECIMAL(5,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "produtos_sku_key" ON "produtos"("sku");
CREATE INDEX "produtos_tipo_ativo_idx" ON "produtos"("tipo", "ativo");
CREATE INDEX "produtos_codigo_barras_idx" ON "produtos"("codigo_barras");
CREATE INDEX "produtos_codigo_interno_idx" ON "produtos"("codigo_interno");
CREATE INDEX "produtos_nome_idx" ON "produtos"("nome");

CREATE TABLE "receita_ingredientes" (
    "id" TEXT NOT NULL,
    "produto_final_id" TEXT NOT NULL,
    "insumo_id" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "observacao" TEXT,
    CONSTRAINT "receita_ingredientes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receita_ingredientes_produto_final_id_insumo_id_key" ON "receita_ingredientes"("produto_final_id", "insumo_id");
CREATE INDEX "receita_ingredientes_insumo_id_idx" ON "receita_ingredientes"("insumo_id");

-- ─── Pedidos ────────────────────────────────────────────────────────────────
--  A sequence precisa existir antes da tabela: o default da coluna a usa.

CREATE SEQUENCE "pedidos_numero_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT nextval('pedidos_numero_seq'),
    "cliente_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'novo',
    "forma_pagamento" "PaymentMethod" NOT NULL DEFAULT 'pix',
    "data_pedido" DATE NOT NULL,
    "data_entrega" DATE,
    "data_faturamento" DATE,
    "data_vencimento" DATE,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outros_custos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "comissao_valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);
ALTER SEQUENCE "pedidos_numero_seq" OWNED BY "pedidos"."numero";
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");
CREATE INDEX "pedidos_cliente_id_idx" ON "pedidos"("cliente_id");
CREATE INDEX "pedidos_vendedor_id_idx" ON "pedidos"("vendedor_id");
CREATE INDEX "pedidos_status_idx" ON "pedidos"("status");
CREATE INDEX "pedidos_data_pedido_idx" ON "pedidos"("data_pedido");
CREATE INDEX "pedidos_data_entrega_idx" ON "pedidos"("data_entrega");

CREATE TABLE "pedido_itens" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "preco_unitario" DECIMAL(12,2) NOT NULL,
    "desconto_item" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pedido_itens_pedido_id_idx" ON "pedido_itens"("pedido_id");
CREATE INDEX "pedido_itens_produto_id_idx" ON "pedido_itens"("produto_id");

CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "tipo" "StockMovementType" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "estoque_antes" DECIMAL(12,3) NOT NULL,
    "estoque_depois" DECIMAL(12,3) NOT NULL,
    "pedido_id" TEXT,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "movimentacoes_estoque_produto_id_criado_em_idx" ON "movimentacoes_estoque"("produto_id", "criado_em");
CREATE INDEX "movimentacoes_estoque_pedido_id_idx" ON "movimentacoes_estoque"("pedido_id");
CREATE INDEX "movimentacoes_estoque_criado_em_idx" ON "movimentacoes_estoque"("criado_em");

-- ─── Financeiro ─────────────────────────────────────────────────────────────

CREATE TABLE "lancamentos" (
    "id" TEXT NOT NULL,
    "tipo" "TransactionType" NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "data_lancamento" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_vencimento" DATE,
    "data_pagamento" DATE,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pendente',
    "pedido_id" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lancamentos_tipo_status_idx" ON "lancamentos"("tipo", "status");
CREATE INDEX "lancamentos_data_vencimento_idx" ON "lancamentos"("data_vencimento");
CREATE INDEX "lancamentos_pedido_id_idx" ON "lancamentos"("pedido_id");
CREATE INDEX "lancamentos_categoria_idx" ON "lancamentos"("categoria");

-- ─── Configuração e observabilidade ─────────────────────────────────────────

CREATE TABLE "score_config" (
    "id" TEXT NOT NULL,
    "peso_categoria" INTEGER NOT NULL DEFAULT 25,
    "peso_compatibilidade" INTEGER NOT NULL DEFAULT 20,
    "peso_potencial" INTEGER NOT NULL DEFAULT 15,
    "peso_regiao" INTEGER NOT NULL DEFAULT 15,
    "peso_digital" INTEGER NOT NULL DEFAULT 10,
    "peso_proximidade" INTEGER NOT NULL DEFAULT 10,
    "peso_qualidade_dados" INTEGER NOT NULL DEFAULT 5,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "score_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "score_historico" (
    "id" TEXT NOT NULL,
    "pesos" JSONB NOT NULL,
    "atualizado_por" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "score_historico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospeccao_execucao" (
    "id" TEXT NOT NULL,
    "iniciado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_em" TIMESTAMP(3),
    "regiao_id" TEXT,
    "bairro_id" TEXT,
    "categoria" TEXT,
    "busca" TEXT,
    "resultados_encontrados" INTEGER NOT NULL DEFAULT 0,
    "novos_leads" INTEGER NOT NULL DEFAULT 0,
    "duplicados" INTEGER NOT NULL DEFAULT 0,
    "clientes_existentes" INTEGER NOT NULL DEFAULT 0,
    "erros" TEXT,
    "custo_estimado" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProspectingRunStatus" NOT NULL DEFAULT 'RUNNING',
    CONSTRAINT "prospeccao_execucao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prospeccao_execucao_iniciado_em_idx" ON "prospeccao_execucao"("iniciado_em");

CREATE TABLE "api_consumo" (
    "id" TEXT NOT NULL,
    "data_uso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servico" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "quantidade_chamadas" INTEGER NOT NULL DEFAULT 1,
    "custo_estimado" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "regiao" TEXT,
    "execucao_id" TEXT,
    CONSTRAINT "api_consumo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_consumo_data_uso_idx" ON "api_consumo"("data_uso");
CREATE INDEX "api_consumo_servico_idx" ON "api_consumo"("servico");

CREATE TABLE "config_sistema" (
    "id" TEXT NOT NULL,
    "limite_custo_diario" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "limite_custo_mensal" DECIMAL(10,2) NOT NULL DEFAULT 150,
    "custo_diario_atual" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "custo_mensal_atual" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "janela_custo_data" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "janela_custo_mes" TEXT NOT NULL DEFAULT '',
    "api_pausada" BOOLEAN NOT NULL DEFAULT false,
    "raio_proximidade_km" INTEGER NOT NULL DEFAULT 5,
    "template_whatsapp" TEXT NOT NULL DEFAULT 'Olá! Tudo bem? Sou {vendedor}, da Doces Prigor...',
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_sistema_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "valor_antigo" JSONB,
    "valor_novo" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "logs_auditoria_usuario_id_criado_em_idx" ON "logs_auditoria"("usuario_id", "criado_em");
CREATE INDEX "logs_auditoria_entidade_entidade_id_idx" ON "logs_auditoria"("entidade", "entidade_id");

-- ─── Chaves estrangeiras ────────────────────────────────────────────────────

ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bairros" ADD CONSTRAINT "bairros_regiao_id_fkey" FOREIGN KEY ("regiao_id") REFERENCES "regioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bairros" ADD CONSTRAINT "bairros_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_regiao_id_fkey" FOREIGN KEY ("regiao_id") REFERENCES "regioes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_regiao_id_fkey" FOREIGN KEY ("regiao_id") REFERENCES "regioes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_cliente_convertido_id_fkey" FOREIGN KEY ("cliente_convertido_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "atividades" ADD CONSTRAINT "atividades_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "amostras" ADD CONSTRAINT "amostras_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "amostras" ADD CONSTRAINT "amostras_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "receita_ingredientes" ADD CONSTRAINT "receita_ingredientes_produto_final_id_fkey" FOREIGN KEY ("produto_final_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receita_ingredientes" ADD CONSTRAINT "receita_ingredientes_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
