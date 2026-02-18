
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const email = 'b@gmail.com'
  const domainName = 'Philosophy'

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.log('User not found')
    return
  }
  console.log('User:', user.id, user.role)

  const domain = await prisma.domain.findFirst({ where: { name: domainName } })
  if (!domain) {
    console.log('Domain not found')
    return
  }
  console.log('Domain:', domain.id, domain.name)

  // Check experts
  const experts = await prisma.domainExpert.findMany({ where: { userId: user.id } })
  console.log('User Experts:', experts)

  // Check investments
  const investments = await prisma.domainInvestment.findMany({
    where: {
      OR: [
        { targetDomainId: domain.id },
        { proposerDomainId: domain.id }
      ]
    },
    include: {
        proposerDomain: true,
        targetDomain: true
    }
  })
  console.log('Investments linked to Philosophy:', investments.map(i => ({
      proposer: i.proposerDomain.name,
      target: i.targetDomain.name,
      pInvested: i.percentageInvested,
      pReturn: i.percentageReturn,
      status: i.status
  })))

  // Simulate getDomainVotingShares logic
  console.log('--- Simulating getDomainVotingShares ---')
  const calculatedShares = []
  let totalExternal = 0

  for (const inv of investments) {
      if (inv.targetDomainId === domain.id) {
          if (inv.percentageReturn > 0) {
              calculatedShares.push({
                  owner: inv.proposerDomain.name,
                  ownerWing: 'RIGHT',
                  pct: inv.percentageReturn
              })
              totalExternal += inv.percentageReturn
          }
      } else {
          if (inv.percentageInvested > 0) {
              calculatedShares.push({
                  owner: inv.targetDomain.name,
                  ownerWing: 'RIGHT',
                  pct: inv.percentageInvested
              })
              totalExternal += inv.percentageInvested
          }
      }
  }
  const remaining = Math.max(0, 100 - totalExternal)
  if (remaining > 0) {
      calculatedShares.push({
          owner: domain.name,
          ownerWing: 'RIGHT',
          pct: remaining
      })
  }
  console.log('Calculated Shares:', calculatedShares)

  // Simulate calculateUserVotingWeight
  console.log('--- Simulating calculateUserVotingWeight ---')
  let maxWeight = 0
  for (const exp of experts) {
      // Find share for this expert's domain and wing
      // We need to map expert domain ID to name to check against calculatedShares above, 
      // but in real code we use IDs.
      // Let's find the domain name for the expert
      const expDomain = await prisma.domain.findUnique({ where: { id: exp.domainId } })
      console.log(`Checking expert: Domain=${expDomain.name}, Wing=${exp.wing}`)
      
      const share = calculatedShares.find(s => s.owner === expDomain.name && s.ownerWing === exp.wing)
      if (share) {
          console.log(`  Match found! Share: ${share.pct}%`)
          maxWeight = Math.max(maxWeight, share.pct)
      } else {
          console.log(`  No match.`)
      }
  }
  console.log('Final Weight:', maxWeight)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
