
import { PrismaClient } from '@prisma/client'
import { getDomainVotingShares } from './lib/voting-utils'

const prisma = new PrismaClient()

async function main() {
  const userEmail = 'c@gmail.com'
  const domainName = 'Philosophy'
  const targetWing = 'LEFT' // We are voting for LEFT wing candidates

  console.log(`Checking voting rights for ${userEmail} in ${domainName} (${targetWing})`)

  // 1. Get User
  const user = await prisma.user.findFirst({ where: { email: userEmail } })
  if (!user) {
    console.error('User not found')
    return
  }
  console.log(`User ID: ${user.id}`)

  // 2. Get Domain
  const domain = await prisma.domain.findFirst({ where: { name: domainName } })
  if (!domain) {
    console.error('Domain not found')
    return
  }
  console.log(`Domain ID: ${domain.id}`)

  // 3. Get User Experts
  const experts = await prisma.domainExpert.findMany({
    where: { userId: user.id },
    include: { domain: true }
  })
  console.log('User Experts:')
  experts.forEach(e => {
    console.log(`- Domain: ${e.domain.name} (${e.domainId}), Wing: ${e.wing}, Role: ${e.role}`)
  })

  // 4. Get Shares
  console.log(`Fetching shares for ${domainName} (${targetWing})...`)
  const shares = await getDomainVotingShares(domain.id, targetWing)
  console.log('Shares found:')
  shares.forEach(s => {
    console.log(`- Owner Domain: ${s.ownerDomainName} (${s.ownerDomainId}), Owner Wing: ${s.ownerWing}, Percentage: ${s.percentage}`)
  })

  // 5. Match Logic
  let maxWeight = 0
  let canVote = false
  
  for (const exp of experts) {
    const share = shares.find(s => s.ownerDomainId === exp.domainId && s.ownerWing === exp.wing)
    if (share) {
      console.log(`MATCH FOUND! Expert in ${exp.domain.name} (${exp.wing}) matches share owned by ${share.ownerDomainName} (${share.ownerWing}) with ${share.percentage}%`)
      maxWeight = Math.max(maxWeight, share.percentage)
      canVote = true
    } else {
        console.log(`No match for expert in ${exp.domain.name} (${exp.wing})`)
    }
  }

  console.log(`Result: Can Vote: ${canVote}, Weight: ${maxWeight}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
