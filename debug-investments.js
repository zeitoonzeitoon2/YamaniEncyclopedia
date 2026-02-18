
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const d = await prisma.domain.findFirst({
    where: { name: 'علوم اجتماعی' }
  })
  
  if (!d) {
    console.log('Domain not found')
    return
  }
  
  console.log('Domain:', d)
  
  const invs = await prisma.domainInvestment.findMany({
    where: { targetDomainId: d.id }
  })
  
  console.log('Investments:', invs)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
