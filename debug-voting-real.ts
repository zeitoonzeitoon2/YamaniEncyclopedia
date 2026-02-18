
import { PrismaClient } from '@prisma/client'
import { calculateUserVotingWeight } from '@/lib/voting-utils'

const prisma = new PrismaClient()

async function main() {
  const email = 'b@gmail.com'
  const domainName = 'Philosophy'

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.log('User not found')
    return
  }
  console.log('User:', user.id)

  const domain = await prisma.domain.findFirst({ 
    where: { name: domainName },
    include: { 
      children: { include: { experts: true } },
      experts: true
    }
  })
  if (!domain) {
    console.log('Domain not found')
    return
  }
  console.log('Domain:', domain.id)
  console.log('Children:', domain.children.map(c => ({ name: c.name, id: c.id, expertsCount: c.experts.length })))

  const child = domain.children.find(c => c.name === 'علوم اجتماعی')
  if (child) {
      console.log('Social Sciences experts:', child.experts.map(e => ({ id: e.userId, wing: e.wing })))
  } else {
      console.log('Social Sciences is NOT a direct child of Philosophy')
  }

  console.log('--- Calling calculateUserVotingWeight for CANDIDACY (RIGHT) ---')
  const weight = await calculateUserVotingWeight(user.id, domain.id, 'CANDIDACY', { targetWing: 'RIGHT' })
  console.log('Weight:', weight)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
