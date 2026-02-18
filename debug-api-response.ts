
import { PrismaClient } from '@prisma/client'
import { calculateUserVotingWeight } from './lib/voting-utils'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'b@gmail.com' } })
  if (!user) {
    console.log('User b@gmail.com not found')
    return
  }
  
  const domain = await prisma.domain.findFirst({ where: { name: 'Philosophy' } })
  if (!domain) {
    console.log('Domain Philosophy not found')
    return
  }

  console.log(`User: ${user.email} (ID: ${user.id})`)
  console.log(`Domain: ${domain.name} (ID: ${domain.id})`)
  
  const [weightRight, weightLeft] = await Promise.all([
    calculateUserVotingWeight(user.id, domain.id, 'CANDIDACY', { targetWing: 'RIGHT' }),
    calculateUserVotingWeight(user.id, domain.id, 'CANDIDACY', { targetWing: 'LEFT' })
  ])

  console.log('--- Voting Weights ---')
  console.log(`RIGHT Wing Election: ${weightRight}%`)
  console.log(`LEFT Wing Election: ${weightLeft}%`)

  const canVoteRight = user.role === 'ADMIN' || weightRight > 0
  const canVoteLeft = user.role === 'ADMIN' || weightLeft > 0

  console.log('--- Voting Rights (API Logic) ---')
  console.log(`Can Vote RIGHT: ${canVoteRight}`)
  console.log(`Can Vote LEFT: ${canVoteLeft}`)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
