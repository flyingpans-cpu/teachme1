import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = url.replace(/^file:/, "").trim();
  if (path.isAbsolute(filePath)) return url;
  const resolved = path.join(
    process.cwd(),
    filePath.startsWith(".") ? "prisma" : "",
    filePath.replace(/^\.\//, ""),
  );
  return `file:${resolved}`;
}

function shouldDisablePersistence() {
  return process.env.VERCEL === "1";
}

export function getPrisma() {
  if (shouldDisablePersistence()) {
    return null;
  }

  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl() });
  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}
