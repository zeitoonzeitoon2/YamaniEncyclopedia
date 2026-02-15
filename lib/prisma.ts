import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const dbUrl = process.env.DATABASE_URL
const normalizedDbUrl = (() => {
  if (!dbUrl) return dbUrl
  try {
    const u = new URL(dbUrl)
    const host = u.host || ''
    if (/pooler\.supabase\.com/i.test(host)) {
      u.searchParams.delete('supavisor_session_id')
      u.searchParams.set('pgbouncer', 'true')
      u.searchParams.set('sslmode', 'require')
      u.searchParams.set('connection_limit', '5')
      return u.toString()
    }
  } catch (e) {
    return dbUrl
  }
  return dbUrl
})()

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: normalizedDbUrl ? { db: { url: normalizedDbUrl } } : undefined,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    errorFormat: 'pretty',
  })

// Add a connection timeout check/handler if needed, 
// but usually this is done via the connection string.


globalForPrisma.prisma = prisma
