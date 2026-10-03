import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // `prisma generate` (postinstall) no necesita la base: así compila aunque el entorno
  // (ej. un Preview de Vercel) no tenga DATABASE_URL. Las migraciones sí la exigen.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
