const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const domains = await prisma.domain.findMany()
  console.log(`Initializing voting shares for ${domains.length} domains...`)

  for (const domain of domains) {
    // Check if share already exists
    const existing = await prisma.domainVotingShare.findUnique({
      where: {
        domainId_ownerDomainId: {
          domainId: domain.id,
          ownerDomainId: domain.id
        }
      }
    })

    if (!existing) {
      await prisma.domainVotingShare.create({
        data: {
          domainId: domain.id,
          ownerDomainId: domain.id,
          percentage: 100
        }
      })
      console.log(`Created 100% share for domain: ${domain.name} (${domain.slug})`)
    } else {
      console.log(`Share already exists for domain: ${domain.name}`)
    }
  }

  console.log('Done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
