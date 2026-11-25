import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` (e.g. in a Docker `deps` layer, or CI before a .env
    // exists) doesn't need a real database — plain process.env keeps that
    // optional. `prisma migrate *` genuinely needs it, and gets it from the
    // real environment at that point (docker-compose `environment:`, CI
    // `env:`, or a local .env).
    url: process.env.DATABASE_URL ?? "",
  },
});
