const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const domains = await prisma.domain.findMany({ take: 1 })
    console.log('Successfully connected to database. Found', domains.length, 'domains.')
  } catch (error) {
    console.error('Failed to connect to database:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
