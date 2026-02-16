import { prisma } from './prisma'

export type VotingMode = 'DIRECT' | 'STRATEGIC' | 'CANDIDACY'

/**
 * Calculates the voting weight of a user in a target domain.
 * 
 * Mode 'STRATEGIC':
 * Weight = Sum across all domains D_i where user is an expert:
 * (Effective Share of D_i (Wing_i) in Target (TargetWing)) / (Number of experts in D_i (Wing_i))
 * 
 * Mode 'DIRECT':
 * Weight = 100 / (Total number of direct experts in Target Domain) if user is a direct expert, else 0.
 * 
 * Mode 'CANDIDACY':
 * This mode handles the complex wing-based appointment/selection logic with "Separate Baskets".
 * - Right Wing Election: Top-down. Only Parent's Right Wing share in Child(Right) counts. Voters are Parent's experts.
 * - Left Wing Election: Bottom-up. Internal Right Wing share in Target(Left) + Subdomain Right Wing shares in Target(Left) count. Voters are Right Wing experts.
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

export async function getEffectiveShare(
  ownerId: string, 
  targetId: string, 
  ownerWing: string = 'RIGHT',
  domainWing: string = 'RIGHT'
) {
  // 1. Permanent Share
  const share = await prisma.domainVotingShare.findFirst({
    where: { 
      domainId: targetId, 
      domainWing: domainWing,
      ownerDomainId: ownerId,
      ownerWing: ownerWing
    },
    select: { percentage: true }
  })
  let effective = share?.percentage || 0

  // 2. Adjustments for Investments
  if (ownerId === targetId) {
    // Internal Share Calculation (Self-Governance of that Wing)
    
    // Subtract shares given to others via Returns (Investments where Target=Self & TargetWing=DomainWing)
    // We are giving away shares of OURSELVES (DomainWing).
    const givenAsReturns = await prisma.domainInvestment.aggregate({
      where: { 
        targetDomainId: targetId, 
        targetWing: domainWing,
        status: 'ACTIVE' 
      },
      _sum: { percentageReturn: true }
    })
    effective -= (givenAsReturns._sum.percentageReturn || 0)

    // Subtract shares staked in others via Invested (Investments where Proposer=Self & ProposerWing=DomainWing)
    // We are giving away shares of OURSELVES (DomainWing) as investment stake.
    const stakedAsInvested = await prisma.domainInvestment.aggregate({
      where: { 
        proposerDomainId: targetId, 
        proposerWing: domainWing,
        status: 'ACTIVE' 
      },
      _sum: { percentageInvested: true }
    })
    effective -= (stakedAsInvested._sum.percentageInvested || 0)

  } else {
    // External Share Calculation (Owner in Target)
    
    // Add shares gained via Returns (Owner invested in Target)
    // Owner is Proposer (OwnerWing), Target is Target (DomainWing)
    // Owner gets shares of Target (DomainWing).
    const gainedAsReturn = await prisma.domainInvestment.aggregate({
      where: { 
        proposerDomainId: ownerId, 
        proposerWing: ownerWing,
        targetDomainId: targetId, 
        targetWing: domainWing,
        status: 'ACTIVE' 
      },
      _sum: { percentageReturn: true }
    })
    effective += (gainedAsReturn._sum.percentageReturn || 0)

    // Add shares gained via Invested (Target invested in Owner)
    // Target (Proposer) gives shares of Target (ProposerWing) to Owner.
    // Proposer=Target, ProposerWing=DomainWing.
    const gainedAsInvested = await prisma.domainInvestment.aggregate({
      where: { 
        proposerDomainId: targetId, 
        proposerWing: domainWing,
        targetDomainId: ownerId, 
        targetWing: ownerWing,
        status: 'ACTIVE' 
      },
      _sum: { percentageInvested: true }
    })
    effective += (gainedAsInvested._sum.percentageInvested || 0)
  }

  return Math.max(0, effective)
}

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
      // Right Wing Election (Top-Down)
      // Voters: Members of Parent's Right Wing OR Parent's Left Wing
      // Share: Only Parent's RIGHT Wing share in Child's RIGHT Wing counts.
      
      const targetDomain = await prisma.domain.findUnique({
        where: { id: targetDomainId },
        select: { parentId: true }
      })
      if (!targetDomain?.parentId) return 0

      // 1. Is voter an expert in the parent domain?
      const voterMembership = await prisma.domainExpert.findFirst({
        where: { userId, domainId: targetDomain.parentId },
        select: { wing: true, role: true }
      })
      if (!voterMembership) return 0

      // 2. Calculate Parent's Effective Share in Child (Right Wing Basket)
      const effectivePercentage = await getEffectiveShare(targetDomain.parentId, targetDomainId, 'RIGHT', 'RIGHT')
      
      if (effectivePercentage <= 0) return 0

      // 3. Distribute among ALL experts in Parent (Right + Left)
      const allParentExperts = await prisma.domainExpert.findMany({
        where: { domainId: targetDomain.parentId },
        select: { role: true }
      })

      const totalPoints = allParentExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      const userPoints = voterMembership.role === 'HEAD' ? 2 : 1

      return totalPoints > 0 ? (effectivePercentage / totalPoints) * userPoints : 0
      
    } else {
      // Left Wing Election (Bottom-Up)
      // Voters: Members of Domain's Right Wing OR Subdomains' Right Wings
      // Share: Internal Right Shares (in Left Wing) + Subdomain Right Shares (in Left Wing)
      
      let totalWeight = 0
      const domainWing = 'LEFT' // Voting on Left Wing

      // Part A: Voter is in Domain's Right Wing (Internal Share)
      const internalMembership = await prisma.domainExpert.findFirst({
        where: { userId, domainId: targetDomainId, wing: 'RIGHT' },
        select: { role: true }
      })

      if (internalMembership) {
        // How much of Left Wing is owned by Right Wing?
        const effectiveInternal = await getEffectiveShare(targetDomainId, targetDomainId, 'RIGHT', domainWing)
        
        const rightExperts = await prisma.domainExpert.findMany({
          where: { domainId: targetDomainId, wing: 'RIGHT' },
          select: { role: true }
        })
        const totalInternalPoints = rightExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
        
        if (totalInternalPoints > 0) {
          totalWeight += (effectiveInternal / totalInternalPoints) * (internalMembership.role === 'HEAD' ? 2 : 1)
        }
      }

      // Part B: Voter is in Subdomain's Right Wing
      const childDomains = await prisma.domain.findMany({
        where: { parentId: targetDomainId },
        select: { id: true }
      })
      
      if (childDomains.length > 0) {
        const childDomainIds = childDomains.map(d => d.id)

        // Is voter a RIGHT wing expert in any of these children?
        const subMemberships = await prisma.domainExpert.findMany({
          where: { 
            userId, 
            domainId: { in: childDomainIds },
            wing: 'RIGHT'
          },
          select: { domainId: true, role: true }
        })

        for (const membership of subMemberships) {
          // Get share of Target (Left) owned by Subdomain's RIGHT Wing
          const effectiveSub = await getEffectiveShare(membership.domainId, targetDomainId, 'RIGHT', domainWing)
          
          if (effectiveSub <= 0) continue

          // Distribute among Subdomain's RIGHT wing experts
          const subRightExperts = await prisma.domainExpert.findMany({
            where: { domainId: membership.domainId, wing: 'RIGHT' },
            select: { role: true }
          })

          const totalSubPoints = subRightExperts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
          const userSubPoints = membership.role === 'HEAD' ? 2 : 1

          if (totalSubPoints > 0) {
            totalWeight += (effectiveSub / totalSubPoints) * userSubPoints
          }
        }
      }

      return totalWeight
    }
  }

  // STRATEGIC Mode Logic (Standard cross-domain voting)
  const userMemberships = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true, role: true, wing: true }
  })

  if (userMemberships.length === 0) return 0

  let totalWeight = 0
  const domainWing = extraParams?.targetWing || 'RIGHT' // Default to RIGHT if not specified

  for (const membership of userMemberships) {
    const domainId = membership.domainId
    const wing = membership.wing || 'RIGHT' // Voter's wing
    
    // Calculate Effective Share of user's domain (specific Wing) in target domain (specific Wing)
    const effectiveShare = await getEffectiveShare(domainId, targetDomainId, wing, domainWing)

    if (effectiveShare > 0) {
      // Distribute among experts of that specific wing in that domain
      const domainExperts = await prisma.domainExpert.findMany({
        where: { domainId: domainId, wing: wing },
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
        // Share Owner: Proposer, OwnerWing: ProposerWing
        // Target: TargetDomain, TargetWing: TargetWing
        const existingShare = await tx.domainVotingShare.findFirst({
          where: {
            domainId: inv.targetDomainId,
            domainWing: inv.targetWing,
            ownerDomainId: inv.proposerDomainId,
            ownerWing: inv.proposerWing
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
              domainWing: inv.targetWing,
              ownerDomainId: inv.proposerDomainId,
              ownerWing: inv.proposerWing,
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
    },
    orderBy: {
      percentage: 'desc'
    }
  })
}
