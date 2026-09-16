import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Without these, a query on a dead connection (e.g. the laptop slept
  // mid-ingestion) waits forever instead of failing. query_timeout is
  // enforced client-side by pg, so it works even when the server never
  // sees the query — Postgres's own statement_timeout would not.
  connectionTimeoutMillis: 10_000,
  query_timeout: 30_000,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
