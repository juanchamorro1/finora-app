-- NOTA: las CHECK constraints fueron añadidas manualmente para garantizar la integridad
-- financiera a nivel de base de datos. src/server/__tests__/integrity.test.ts verifica que sigan presentes.

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_name_check" CHECK (length(trim("name")) > 0)
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'circle',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "toAmount" BIGINT,
    "categoryId" TEXT,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_type_check" CHECK ("type" IN ('INCOME','EXPENSE','TRANSFER','OPENING_BALANCE','ADJUSTMENT')),
    CONSTRAINT "Transaction_amount_check" CHECK (("type" IN ('INCOME','EXPENSE','TRANSFER') AND "amount" > 0) OR ("type" IN ('OPENING_BALANCE','ADJUSTMENT') AND "amount" <> 0)),
    CONSTRAINT "Transaction_transfer_check" CHECK (("type" = 'TRANSFER' AND "toAccountId" IS NOT NULL AND "toAccountId" <> "accountId" AND "toAmount" IS NOT NULL AND "toAmount" > 0 AND "categoryId" IS NULL) OR ("type" <> 'TRANSFER' AND "toAccountId" IS NULL AND "toAmount" IS NULL)),
    CONSTRAINT "Transaction_category_check" CHECK (("type" IN ('INCOME','EXPENSE') AND "categoryId" IS NOT NULL) OR ("type" NOT IN ('INCOME','EXPENSE') AND "categoryId" IS NULL)),
    CONSTRAINT "Transaction_description_check" CHECK (length(trim("description")) > 0)
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Budget_amount_check" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "targetDate" DATETIME,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SavingsGoal_target_check" CHECK ("targetAmount" > 0)
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalContribution_amount_check" CHECK ("amount" <> 0)
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL PRIMARY KEY,
    "rateMicros" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExchangeRate_rate_check" CHECK ("rateMicros" > 0)
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_kind_key" ON "Category"("name", "kind");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_toAccountId_idx" ON "Transaction"("toAccountId");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_type_date_idx" ON "Transaction"("type", "date");

-- CreateIndex
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_categoryId_key" ON "Budget"("categoryId");

-- CreateIndex
CREATE INDEX "GoalContribution_goalId_idx" ON "GoalContribution"("goalId");
