import { prisma } from './prisma'

export type VotingMode = 'DIRECT' | 'STRATEGIC'

/**
 * Calculates the voting weight of a user in a target domain.
 * 
 * Mode 'STRATEGIC' (Default):
 * Weight = Sum across all domains D_i where user is an expert:
 * (Percentage of Target Domain owned by D_i) / (Number of experts in D_i)
 * 
 * Mode 'DIRECT':
 * Weight = 100 / (Total number of direct experts in Target Domain) if user is a direct expert, else 0.
 * 
 * @param userId The ID of the user whose voting weight is being calculated.
 * @param targetDomainId The ID of the domain where the vote is being cast.
 * @param mode The voting mode: 'DIRECT' for internal matters, 'STRATEGIC' for strategic/cross-domain matters.
 * @returns The total voting weight (percentage, 0-100).
 */
export async function calculateUserVotingWeight(
  userId: string, 
  targetDomainId: string, 
  mode: VotingMode = 'STRATEGIC'
): Promise<number> {
  if (mode === 'DIRECT') {
    const isExpert = await prisma.domainExpert.findFirst({
      where: { userId, domainId: targetDomainId },
      select: { id: true }
    })

    if (!isExpert) return 0

    const totalDirectExperts = await prisma.domainExpert.count({
      where: { domainId: targetDomainId }
    })

    return totalDirectExperts > 0 ? 100 / totalDirectExperts : 0
  }

  // STRATEGIC Mode Logic
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
export async function calculateVotingResult(
  votes: { voterId: string, vote: string }[], 
  targetDomainId: string,
  mode: VotingMode = 'STRATEGIC'
) {
  let approvals = 0
  let rejections = 0

  for (const v of votes) {
    const weight = await calculateUserVotingWeight(v.voterId, targetDomainId, mode)
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
