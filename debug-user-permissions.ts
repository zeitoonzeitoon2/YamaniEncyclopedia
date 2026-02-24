
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = 'c@gmail.com'
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      domainExperts: {
        include: {
          domain: true
        }
      }
    }
  })

  if (!user) {
    console.log(`User with email ${email} not found`)
    return
  }

  console.log(`User found: ${user.name} (${user.id})`)
  console.log('Domain Experts:')
  user.domainExperts.forEach(expert => {
    console.log(`- Domain: ${expert.domain.name} (${expert.domain.id}), Role: ${expert.role}, Wing: ${expert.wing}`)
  })
  
  // Also check all pending proposals to see which domain they belong to
  const proposals = await prisma.domainProposal.findMany({
    where: { status: 'PENDING' },
    include: {
      targetDomain: true
    }
  })
  
  console.log('\nPending Proposals:')
  proposals.forEach(p => {
    console.log(`- Type: ${p.type}, Name: ${p.name || p.newName}, Target: ${p.targetDomain?.name} (${p.targetDomainId}), ParentId: ${p.parentId}`)
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
