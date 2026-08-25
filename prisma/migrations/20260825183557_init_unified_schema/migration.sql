-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SELLER');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NOVO', 'QUALIFICADO', 'ATRIBUIDO', 'ABORDADO', 'CONTATO_REALIZADO', 'INTERESSADO', 'REUNIAO', 'AMOSTRA', 'NEGOCIACAO', 'NOVO_REVENDEDOR', 'PERDIDO');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('SEM_INTERESSE', 'PRECO', 'JA_POSSUI_FORNECEDOR', 'PRODUZ_INTERNAMENTE', 'NAO_TRABALHA_COM_SOBREMESAS', 'BAIXO_MOVIMENTO', 'ESTABELECIMENTO_FECHADO', 'CONTATO_INVALIDO', 'RESPONSAVEL_NAO_ENCONTRADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('VISIT', 'WHATSAPP', 'PHONE', 'MEETING', 'SAMPLE', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "SampleResult" AS ENUM ('GOSTOU', 'INTERESSADO', 'PENSANDO', 'NAO_GOSTOU', 'SEM_INTERESSE');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('venda', 'insumo');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('baixa_insumo', 'entrada_recheio', 'entrada_produto', 'saida_venda');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('receita', 'despesa');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('novo', 'confirmado', 'em_producao', 'entregue', 'faturado', 'cancelado');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "senha_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SELLER',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comissao_pct" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "observacoes" TEXT,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regioes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regioes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bairros" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Rio de Janeiro',
    "state" TEXT NOT NULL DEFAULT 'RJ',
    "region_id" TEXT NOT NULL,
    "seller_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bairros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "apelido" TEXT NOT NULL,
    "cnpj" TEXT,
    "cpf" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "email" TEXT,
    "endereco" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "cep" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "categoria" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "regiao_id" TEXT,
    "bairro_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "google_place_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo_externo" TEXT,
    "tipo_lista" TEXT,
    "sexo" TEXT,
    "documento" TEXT,
    "rg" TEXT,
    "uf_rg" TEXT,
    "ie" TEXT,
    "ie_indicador" TEXT,
    "site" TEXT,
    "data_nascimento" TIMESTAMP(3),
    "is_revendedor" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "primeiro_contato_em" TIMESTAMP(3),
    "cliente_convertido_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "reunioes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "vendedor_id" TEXT NOT NULL,
    "data_reuniao" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "observacao" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'AGENDADA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reunioes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amostras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_historico" (
    "id" TEXT NOT NULL,
    "pesos" JSONB NOT NULL,
    "atualizado_por" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "custo_estimado" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "prospeccao_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_consumo" (
    "id" TEXT NOT NULL,
    "data_uso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servico" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "quantidade_chamadas" INTEGER NOT NULL DEFAULT 1,
    "custo_estimado" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "regiao" TEXT,
    "execucao_id" TEXT,

    CONSTRAINT "api_consumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_sistema" (
    "id" TEXT NOT NULL,
    "limite_custo_diario" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "limite_custo_mensal" DOUBLE PRECISION NOT NULL DEFAULT 150.0,
    "custo_diario_atual" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "custo_mensal_atual" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "api_pausada" BOOLEAN NOT NULL DEFAULT false,
    "raio_proximidade_km" INTEGER NOT NULL DEFAULT 5,
    "template_whatsapp" TEXT NOT NULL DEFAULT 'Olá! Tudo bem? Sou {vendedor}, da Doces Prigor...',
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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
    "preco_venda" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "preco_atacado" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "qtd_min_atacado" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "preco_de" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "preco_por" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "custo" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "estoque" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "estoque_minimo" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "movimenta_estoque" BOOLEAN NOT NULL DEFAULT true,
    "ncm" TEXT,
    "cfop" TEXT,
    "origem" TEXT,
    "cest" TEXT,
    "peso_kg" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "altura_cm" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "largura_cm" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "profundidade_cm" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "tags" TEXT,
    "garantia" TEXT,
    "itens_inclusos" TEXT,
    "especificacoes" TEXT,
    "imagem" TEXT,
    "comissao_pct" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receita_ingredientes" (
    "id" TEXT NOT NULL,
    "produto_final_id" TEXT NOT NULL,
    "insumo_id" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "receita_ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vendedor_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'novo',
    "forma_pagamento" "PaymentMethod" DEFAULT 'pix',
    "data_pedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_entrega" TIMESTAMP(3),
    "data_faturamento" TIMESTAMP(3),
    "data_vencimento" TIMESTAMP(3),
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "frete" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "outros_custos" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "comissao_valor" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "preco_unitario" DOUBLE PRECISION NOT NULL,
    "desconto_item" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "tipo" "StockMovementType" NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL,
    "estoque_antes" DOUBLE PRECISION NOT NULL,
    "estoque_depois" DOUBLE PRECISION NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" TEXT NOT NULL,
    "tipo" "TransactionType" NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "data_lancamento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_vencimento" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "status" "TransactionStatus" NOT NULL DEFAULT 'pendente',
    "pedido_id" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_usuario_id_key" ON "vendedores"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "regioes_name_key" ON "regioes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bairros_name_city_state_key" ON "bairros"("name", "city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cnpj_key" ON "clientes"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_google_place_id_key" ON "clientes"("google_place_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_cnpj_key" ON "leads"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "leads_google_place_id_key" ON "leads"("google_place_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_sku_key" ON "produtos"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_key" ON "pedidos"("numero");

-- AddForeignKey
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bairros" ADD CONSTRAINT "bairros_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regioes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bairros" ADD CONSTRAINT "bairros_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_regiao_id_fkey" FOREIGN KEY ("regiao_id") REFERENCES "regioes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_regiao_id_fkey" FOREIGN KEY ("regiao_id") REFERENCES "regioes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "bairros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_cliente_convertido_id_fkey" FOREIGN KEY ("cliente_convertido_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunioes" ADD CONSTRAINT "reunioes_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostras" ADD CONSTRAINT "amostras_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostras" ADD CONSTRAINT "amostras_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receita_ingredientes" ADD CONSTRAINT "receita_ingredientes_produto_final_id_fkey" FOREIGN KEY ("produto_final_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receita_ingredientes" ADD CONSTRAINT "receita_ingredientes_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
