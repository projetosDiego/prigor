-- Pedidos feitos pelo site (cardápio de Natal)
CREATE TABLE IF NOT EXISTS "ShopOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT 'natal2026',
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "customerType" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "fulfillment" TEXT NOT NULL,
    "pickupPoint" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    "complement" TEXT NOT NULL DEFAULT '',
    "neighborhood" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "deliveryDate" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "paymentPlan" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amountDueCents" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "erpStatus" TEXT NOT NULL DEFAULT 'PENDENTE',
    "erpOrderNumber" TEXT NOT NULL DEFAULT '',
    "erpError" TEXT NOT NULL DEFAULT '',
    "erpAttempts" INTEGER NOT NULL DEFAULT 0,
    "erpSentAt" DATETIME,
    "utmSource" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShopOrder_code_key" ON "ShopOrder"("code");
CREATE INDEX IF NOT EXISTS "ShopOrder_campaign_createdAt_idx" ON "ShopOrder"("campaign", "createdAt");
CREATE INDEX IF NOT EXISTS "ShopOrder_status_idx" ON "ShopOrder"("status");
CREATE INDEX IF NOT EXISTS "ShopOrder_erpStatus_idx" ON "ShopOrder"("erpStatus");
