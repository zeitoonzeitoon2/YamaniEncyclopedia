import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const dbUrl = process.env.DATABASE_URL

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    errorFormat: 'pretty',
  })

// @ts-ignore
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
