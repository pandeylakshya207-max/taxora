// Prisma 7 configuration. The CLI does not read .env on its own, so we load it here.
// Migrations use DIRECT_URL (non-pooled); the running app uses DATABASE_URL (pooled).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
