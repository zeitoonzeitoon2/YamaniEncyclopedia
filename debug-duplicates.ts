
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const domains = await prisma.domain.findMany({
    where: { name: 'Philosophy' },
    select: { id: true, slug: true, parentId: true }
  })
  console.log('Philosophy Domains:', domains)

  const socialSciences = await prisma.domain.findMany({
    where: { name: 'علوم اجتماعی' },
    select: { id: true, slug: true, parentId: true }
  })
  console.log('Social Sciences Domains:', socialSciences)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
