import { PrismaClient } from "@prisma/client";
import { withLiveSignals } from "./live";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Query extensions leave the client's types unchanged, so it keeps the plain PrismaClient type. */
export const prisma = globalForPrisma.prisma ?? (withLiveSignals(new PrismaClient()) as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
