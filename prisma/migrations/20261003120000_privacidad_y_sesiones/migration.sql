-- Privacidad y sesiones (ADD COLUMN no recrea tablas: las CHECK constraints se conservan).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "privacyVersion" INTEGER;
ALTER TABLE "User" ADD COLUMN "privacyAcceptedAt" DATETIME;

CREATE TABLE "LoginAttempt" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
