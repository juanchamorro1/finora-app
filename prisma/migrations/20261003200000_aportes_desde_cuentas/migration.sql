-- Aportes a metas que salen de una cuenta (ADD COLUMN no recrea tablas: las CHECK constraints se conservan).
ALTER TABLE "Category" ADD COLUMN "systemKey" TEXT;
CREATE UNIQUE INDEX "Category_userId_systemKey_key" ON "Category"("userId", "systemKey");

ALTER TABLE "GoalContribution" ADD COLUMN "transactionId" TEXT REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "GoalContribution_transactionId_key" ON "GoalContribution"("transactionId");
