-- Multiusuario: cada usuario ve solo sus datos.
--
-- Escrita a mano para (1) asignar los datos existentes a un usuario principal y
-- (2) conservar las CHECK constraints de integridad al recrear las tablas.
-- Si la base está vacía (instalación nueva) no se crea ningún usuario.
-- El usuario principal queda con contraseña PENDIENTE: se define con
-- `npm run users -- password juan` (local) o `npm run users -- password juan --nube`.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_username_check" CHECK (length("username") BETWEEN 3 AND 30 AND "username" = lower("username") AND "username" NOT GLOB '*[^a-z0-9._-]*'),
    CONSTRAINT "User_name_check" CHECK (length(trim("name")) > 0)
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

INSERT INTO "User" ("id", "username", "name", "passwordHash", "createdAt", "updatedAt")
SELECT 'usuario-principal', 'juan', 'Juan', 'PENDIENTE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM "Account") OR EXISTS (SELECT 1 FROM "Setting") OR EXISTS (SELECT 1 FROM "Category");

-- Account
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_name_check" CHECK (length(trim("name")) > 0)
);
INSERT INTO "new_Account" ("id", "userId", "name", "type", "currency", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT "id", 'usuario-principal', "name", "type", "currency", "isActive", "sortOrder", "createdAt", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- Category
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'circle',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("id", "userId", "name", "kind", "icon", "color", "isDefault", "isArchived", "sortOrder", "createdAt", "updatedAt")
SELECT "id", 'usuario-principal', "name", "kind", "icon", "color", "isDefault", "isArchived", "sortOrder", "createdAt", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_userId_idx" ON "Category"("userId");
CREATE UNIQUE INDEX "Category_userId_name_kind_key" ON "Category"("userId", "name", "kind");

-- Transaction
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
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
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_type_check" CHECK ("type" IN ('INCOME','EXPENSE','TRANSFER','OPENING_BALANCE','ADJUSTMENT')),
    CONSTRAINT "Transaction_amount_check" CHECK (("type" IN ('INCOME','EXPENSE','TRANSFER') AND "amount" > 0) OR ("type" IN ('OPENING_BALANCE','ADJUSTMENT') AND "amount" <> 0)),
    CONSTRAINT "Transaction_transfer_check" CHECK (("type" = 'TRANSFER' AND "toAccountId" IS NOT NULL AND "toAccountId" <> "accountId" AND "toAmount" IS NOT NULL AND "toAmount" > 0 AND "categoryId" IS NULL) OR ("type" <> 'TRANSFER' AND "toAccountId" IS NULL AND "toAmount" IS NULL)),
    CONSTRAINT "Transaction_category_check" CHECK (("type" IN ('INCOME','EXPENSE') AND "categoryId" IS NOT NULL) OR ("type" NOT IN ('INCOME','EXPENSE') AND "categoryId" IS NULL)),
    CONSTRAINT "Transaction_description_check" CHECK (length(trim("description")) > 0)
);
INSERT INTO "new_Transaction" ("id", "userId", "type", "amount", "accountId", "toAccountId", "toAmount", "categoryId", "date", "description", "note", "createdAt", "updatedAt", "deletedAt")
SELECT "id", 'usuario-principal', "type", "amount", "accountId", "toAccountId", "toAmount", "categoryId", "date", "description", "note", "createdAt", "updatedAt", "deletedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");
CREATE INDEX "Transaction_toAccountId_idx" ON "Transaction"("toAccountId");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_type_date_idx" ON "Transaction"("type", "date");
CREATE INDEX "Transaction_deletedAt_idx" ON "Transaction"("deletedAt");

-- SavingsGoal
CREATE TABLE "new_SavingsGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "targetDate" DATETIME,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SavingsGoal_target_check" CHECK ("targetAmount" > 0)
);
INSERT INTO "new_SavingsGoal" ("id", "userId", "name", "targetAmount", "targetDate", "accountId", "status", "completedAt", "createdAt", "updatedAt")
SELECT "id", 'usuario-principal', "name", "targetAmount", "targetDate", "accountId", "status", "completedAt", "createdAt", "updatedAt" FROM "SavingsGoal";
DROP TABLE "SavingsGoal";
ALTER TABLE "new_SavingsGoal" RENAME TO "SavingsGoal";
CREATE INDEX "SavingsGoal_userId_idx" ON "SavingsGoal"("userId");

-- ExchangeRate
CREATE TABLE "new_ExchangeRate" (
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rateMicros" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "currency"),
    CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_rate_check" CHECK ("rateMicros" > 0)
);
INSERT INTO "new_ExchangeRate" ("userId", "currency", "rateMicros", "updatedAt")
SELECT 'usuario-principal', "currency", "rateMicros", "updatedAt" FROM "ExchangeRate";
DROP TABLE "ExchangeRate";
ALTER TABLE "new_ExchangeRate" RENAME TO "ExchangeRate";

-- Setting
CREATE TABLE "new_Setting" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "key"),
    CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Setting" ("userId", "key", "value", "updatedAt")
SELECT 'usuario-principal', "key", "value", "updatedAt" FROM "Setting";
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
