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
    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId: targetDomainId },
      select: { role: true }
    })

    if (!membership) return 0

    // Get all experts to calculate total weight (HEAD=2, EXPERT=1)
    const allExperts = await prisma.domainExpert.findMany({
      where: { domainId: targetDomainId },
      select: { role: true }
    })

    const totalPoints = allExperts.reduce((sum, expert) => sum + (expert.role === 'HEAD' ? 2 : 1), 0)
    const userPoints = membership.role === 'HEAD' ? 2 : 1

    return totalPoints > 0 ? (100 / totalPoints) * userPoints : 0
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
        select: { wing: true, role: true }
      })
      if (!voterMembership) return 0

      // Get shares of child owned by parent
      const share = await prisma.domainVotingShare.findFirst({
        where: { domainId: targetDomainId, ownerDomainId: targetDomain.parentId },
        select: { percentage: true }
      })
      
      let effectivePercentage = share?.percentage || 0

      // Adjust for active investments between parent and child
      const outbound = await prisma.domainInvestment.findMany({
        where: { proposerDomainId: targetDomain.parentId, targetDomainId: targetDomainId, status: 'ACTIVE' }
      })
      for (const inv of outbound) effectivePercentage -= inv.percentageInvested

      const inbound = await prisma.domainInvestment.findMany({
        where: { proposerDomainId: targetDomainId, targetDomainId: targetDomain.parentId, status: 'ACTIVE' }
      })
      for (const inv of inbound) effectivePercentage += inv.percentageInvested

      if (effectivePercentage <= 0) return 0

      // Weight = (Effective share) / (Weighted count of experts in voter's wing in Parent)
      const sameWingExperts = await prisma.domainExpert.findMany({
        where: { domainId: targetDomain.parentId, wing: voterMembership.wing },
        select: { role: true }
      })

      const totalPoints = sameWingExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      const userPoints = voterMembership.role === 'HEAD' ? 2 : 1

      return totalPoints > 0 ? (effectivePercentage / totalPoints) * userPoints : 0
    } else {
      // Bottom-Up Selection: Children's Right teams vote for Parent's Left team.
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
        select: { domainId: true, role: true }
      })
      if (voterMemberships.length === 0) return 0

      let totalWeight = 0
      for (const membership of voterMemberships) {
        // Get share of parent (targetDomainId) owned by this child
        const share = await prisma.domainVotingShare.findFirst({
          where: { domainId: targetDomainId, ownerDomainId: membership.domainId },
          select: { percentage: true }
        })
        
        let effectivePercentage = share?.percentage || 0

        // Adjust for active investments
        const outbound = await prisma.domainInvestment.findMany({
          where: { proposerDomainId: membership.domainId, targetDomainId: targetDomainId, status: 'ACTIVE' }
        })
        for (const inv of outbound) effectivePercentage -= inv.percentageInvested

        const inbound = await prisma.domainInvestment.findMany({
          where: { proposerDomainId: targetDomainId, targetDomainId: membership.domainId, status: 'ACTIVE' }
        })
        for (const inv of inbound) effectivePercentage += inv.percentageInvested

        if (effectivePercentage <= 0) continue

        // Weight = (Effective share) / (Weighted count of RIGHT wing experts in Child)
        const rightWingExperts = await prisma.domainExpert.findMany({
          where: { domainId: membership.domainId, wing: 'RIGHT' },
          select: { role: true }
        })

        const totalPoints = rightWingExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
        const userPoints = membership.role === 'HEAD' ? 2 : 1

        if (totalPoints > 0) {
          totalWeight += (effectivePercentage / totalPoints) * userPoints
        }
      }
      return totalWeight
    }
  }

  // STRATEGIC Mode Logic (Standard cross-domain voting)
  const userMemberships = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true, role: true }
  })

  if (userMemberships.length === 0) return 0

  const userDomainIds = userMemberships.map(m => m.domainId)

  // 1. Base ownership from permanent shares
  const shares = await prisma.domainVotingShare.findMany({
    where: {
      domainId: targetDomainId,
      ownerDomainId: { in: userDomainIds }
    }
  })

  // 2. Adjust for active investments
  let totalWeight = 0

  for (const membership of userMemberships) {
    const domainId = membership.domainId
    let effectiveShare = 0
    
    const permanentShare = shares.find(s => s.ownerDomainId === domainId)
    if (permanentShare) {
      effectiveShare = permanentShare.percentage
    }

    const outboundInvestments = await prisma.domainInvestment.findMany({
      where: {
        proposerDomainId: domainId,
        targetDomainId: targetDomainId,
        status: 'ACTIVE'
      }
    })
    for (const inv of outboundInvestments) {
      effectiveShare -= inv.percentageInvested
    }

    const inboundInvestments = await prisma.domainInvestment.findMany({
      where: {
        proposerDomainId: targetDomainId,
        targetDomainId: domainId,
        status: 'ACTIVE'
      }
    })
    for (const inv of inboundInvestments) {
      effectiveShare += inv.percentageInvested
    }

    if (effectiveShare > 0) {
      const domainExperts = await prisma.domainExpert.findMany({
        where: { domainId: domainId },
        select: { role: true }
      })
      
      const totalPoints = domainExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      const userPoints = membership.role === 'HEAD' ? 2 : 1

      if (totalPoints > 0) {
        totalWeight += (effectiveShare / totalPoints) * userPoints
      }
    }
  }

  return totalWeight
}

/**
 * Settles all expired investments by returning the invested percentage 
 * and transferring the return percentage as a permanent share.
 */
export async function settleExpiredInvestments() {
  const now = new Date()
  
  const expiredInvestments = await prisma.domainInvestment.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { lte: now }
    }
  })

  const results = []

  for (const inv of expiredInvestments) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Mark as RETURNED
        await tx.domainInvestment.update({
          where: { id: inv.id },
          data: { status: 'RETURNED' }
        })

        // 2. Transfer return percentage as permanent share
        // Proposer (investor) gets permanent share in Target domain
        const existingShare = await tx.domainVotingShare.findUnique({
          where: {
            domainId_ownerDomainId: {
              domainId: inv.targetDomainId,
              ownerDomainId: inv.proposerDomainId
            }
          }
        })

        if (existingShare) {
          await tx.domainVotingShare.update({
            where: { id: existingShare.id },
            data: { percentage: existingShare.percentage + inv.percentageReturn }
          })
        } else {
          await tx.domainVotingShare.create({
            data: {
              domainId: inv.targetDomainId,
              ownerDomainId: inv.proposerDomainId,
              percentage: inv.percentageReturn
            }
          })
        }
      })
      results.push({ id: inv.id, status: 'success' })
    } catch (error) {
      console.error(`Failed to settle investment ${inv.id}:`, error)
      results.push({ id: inv.id, status: 'error', error })
    }
  }

  return results
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
