import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Production safety check: ensure pooled Supabase connection is used
const dbUrl = process.env.DATABASE_URL
if (process.env.NODE_ENV === 'production' && dbUrl) {
  try {
    const u = new URL(dbUrl)
    const host = u.host || ''
    const pgb = u.searchParams.get('pgbouncer')
    const ssl = u.searchParams.get('sslmode')
    if (!/pooler\.supabase\.com/i.test(host) || pgb !== 'true' || ssl !== 'require') {
      console.warn('[Prisma] Production DATABASE_URL may not be pooled. Expected host *.pooler.supabase.com with pgbouncer=true&sslmode=require')
    }
  } catch (e) {
    console.warn('[Prisma] Unable to parse DATABASE_URL for validation.')
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma