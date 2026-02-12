import { prisma } from './prisma'

export type VotingMode = 'DIRECT' | 'STRATEGIC' | 'CANDIDACY'

/**
 * Calculates the voting weight of a user in a target domain.
 * 
 * Mode 'STRATEGIC':
 * Weight = Sum across all domains D_i where user is an expert:
 * (Percentage of Target Domain owned by D_i) / (Number of experts in D_i)
 * 
 * Mode 'DIRECT':
 * Weight = 100 / (Total number of direct experts in Target Domain) if user is a direct expert, else 0.
 * 
 * Mode 'CANDIDACY':
 * This mode handles the complex wing-based appointment/selection logic.
 * 
 * @param userId The ID of the user whose voting weight is being calculated.
 * @param targetDomainId The ID of the domain where the vote is being cast.
 * @param mode The voting mode.
 * @param extraParams Optional parameters like targetWing for CANDIDACY mode.
 * @returns The total voting weight (percentage, 0-100).
 */
export async function calculateUserVotingWeight(
  userId: string, 
  targetDomainId: string, 
  mode: VotingMode = 'STRATEGIC',
  extraParams?: { targetWing?: string }
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

  if (mode === 'CANDIDACY') {
    const targetWing = extraParams?.targetWing || 'RIGHT'
    
    if (targetWing === 'RIGHT') {
      // Top-Down Appointment: Parent's Right/Left teams vote for Child's Right team.
      const targetDomain = await prisma.domain.findUnique({
        where: { id: targetDomainId },
        select: { parentId: true }
      })
      if (!targetDomain?.parentId) return 0

      // Is voter an expert in the parent domain?
      const voterMembership = await prisma.domainExpert.findFirst({
        where: { userId, domainId: targetDomain.parentId },
        select: { wing: true }
      })
      if (!voterMembership) return 0

      // Get shares of child owned by parent
      const share = await prisma.domainVotingShare.findFirst({
        where: { domainId: targetDomainId, ownerDomainId: targetDomain.parentId },
        select: { percentage: true }
      })
      if (!share) return 0

      // Weight = (Parent's share of Child) / (Count of experts in voter's wing in Parent)
      const sameWingExpertCount = await prisma.domainExpert.count({
        where: { domainId: targetDomain.parentId, wing: voterMembership.wing }
      })

      return sameWingExpertCount > 0 ? share.percentage / sameWingExpertCount : 0
    } else {
      // Bottom-Up Selection: Children's Right teams vote for Parent's Left team.
      // 1. Get all child domains of targetDomainId
      const childDomains = await prisma.domain.findMany({
        where: { parentId: targetDomainId },
        select: { id: true }
      })
      if (childDomains.length === 0) return 0
      const childDomainIds = childDomains.map(d => d.id)

      // 2. Is voter a RIGHT wing expert in any of these children?
      const voterMemberships = await prisma.domainExpert.findMany({
        where: { 
          userId, 
          domainId: { in: childDomainIds },
          wing: 'RIGHT'
        },
        select: { domainId: true }
      })
      if (voterMemberships.length === 0) return 0

      let totalWeight = 0
      for (const membership of voterMemberships) {
        // Get share of parent (targetDomainId) owned by this child
        const share = await prisma.domainVotingShare.findFirst({
          where: { domainId: targetDomainId, ownerDomainId: membership.domainId },
          select: { percentage: true }
        })
        if (!share) continue

        // Weight = (Child's share of Parent) / (Count of RIGHT wing experts in Child)
        const rightWingExpertCount = await prisma.domainExpert.count({
          where: { domainId: membership.domainId, wing: 'RIGHT' }
        })

        if (rightWingExpertCount > 0) {
          totalWeight += share.percentage / rightWingExpertCount
        }
      }
      return totalWeight
    }
  }

  // STRATEGIC Mode Logic (Standard cross-domain voting)
  const userMemberships = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true }
  })

  if (userMemberships.length === 0) return 0

  const userDomainIds = userMemberships.map(m => m.domainId)

  const shares = await prisma.domainVotingShare.findMany({
    where: {
      domainId: targetDomainId,
      ownerDomainId: { in: userDomainIds }
    }
  })

  if (shares.length === 0) return 0

  let totalWeight = 0

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
  mode: VotingMode = 'STRATEGIC',
  extraParams?: { targetWing?: string }
) {
  let approvals = 0
  let rejections = 0

  for (const v of votes) {
    const weight = await calculateUserVotingWeight(v.voterId, targetDomainId, mode, extraParams)
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
