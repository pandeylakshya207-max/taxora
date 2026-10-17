import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One Prisma client per server process.
 *
 * In development, Next.js hot-reloads modules; without the global cache every
 * reload would open a new connection pool and eventually exhaust the database.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example).");
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString,
    // Opening a new encrypted connection costs several round trips to the
    // database. node-postgres closes idle connections after 10 seconds by
    // default, so any pause in clicking meant paying that cost again. Keep
    // them for 4 minutes instead, with TCP keep-alive so they stay healthy.
    idleTimeoutMillis: 4 * 60_000,
    keepAlive: true,
    max: 10,
  });
  return new PrismaClient({
    adapter,
    // Neon may need a moment to wake from idle, and the database is overseas.
    // Prisma's default 2s wait to start a transaction is too tight for that, so
    // allow up to 10s to start and 20s to finish. Failures still roll back fully.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
