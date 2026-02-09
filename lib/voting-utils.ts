import { prisma } from './prisma'

/**
 * Calculates the voting weight of a user in a target domain.
 * 
 * Formula:
 * Weight = Sum across all domains D_i where user is an expert:
 * (Percentage of Target Domain owned by D_i) / (Number of experts in D_i)
 * 
 * @param userId The ID of the user whose voting weight is being calculated.
 * @param targetDomainId The ID of the domain where the vote is being cast.
 * @returns The total voting weight (percentage, 0-100).
 */
export async function calculateUserVotingWeight(userId: string, targetDomainId: string): Promise<number> {
  // 1. Get all domains where the user is an expert
  const userMemberships = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true }
  })

  if (userMemberships.length === 0) return 0

  const userDomainIds = userMemberships.map(m => m.domainId)

  // 2. Get voting shares of the target domain owned by these domains
  const shares = await prisma.domainVotingShare.findMany({
    where: {
      domainId: targetDomainId,
      ownerDomainId: { in: userDomainIds }
    }
  })

  if (shares.length === 0) return 0

  let totalWeight = 0

  // 3. For each share, divide by the number of experts in the owner domain
  for (const share of shares) {
    const expertCount = await prisma.domainExpert.count({
      where: { domainId: share.ownerDomainId }
    })

    if (expertCount > 0) {
      totalWeight += share.percentage / expertCount
    }
  }

  return totalWeight
}

/**
 * Calculates the total approval and rejection weights for a proposal in a domain.
 */
export async function calculateVotingResult(votes: { voterId: string, vote: string }[], targetDomainId: string) {
  let approvals = 0
  let rejections = 0

  for (const v of votes) {
    const weight = await calculateUserVotingWeight(v.voterId, targetDomainId)
    if (v.vote === 'APPROVE') {
      approvals += weight
    } else if (v.vote === 'REJECT') {
      rejections += weight
    }
  }

  return { approvals, rejections, totalPower: 100 }
}

/**
 * Gets the total voting power distribution for a domain.
 * Returns an array of owner domains and their percentage of ownership.
 */
export async function getDomainPowerDistribution(domainId: string) {
  return await prisma.domainVotingShare.findMany({
    where: { domainId },
    include: {
      ownerDomain: {
        select: { id: true, name: true, slug: true }
      }
    }
  })
}
