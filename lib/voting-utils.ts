import { prisma } from '@/lib/prisma'

export interface VotingShare {
  ownerDomainId: string
  ownerWing: string // 'RIGHT' or 'LEFT'
  percentage: number
  ownerDomain: {
    id: string
    name: string
  }
}

/**
 * Calculates voting shares for a specific election (domain + wing).
 * 
 * Rules:
 * 1. Check explicit DomainVotingShare records first.
 * 2. If none exist, calculate shares based on active DomainInvestment records.
 *    - Incoming Investment (Target <- Proposer): Proposer gets percentageReturn share.
 *    - Outgoing Investment (Proposer -> Target): Target gets percentageInvested share.
 * 3. The remaining share (100 - totalExternal) belongs to the domain itself.
 */
export async function getDomainVotingShares(domainId: string, wing: 'RIGHT' | 'LEFT'): Promise<VotingShare[]> {
  // 1. Get explicit Voting Shares
  let shares = await prisma.domainVotingShare.findMany({
    where: {
      domainId,
      domainWing: wing
    },
    include: {
      ownerDomain: { select: { id: true, name: true } }
    }
  })

  // 2. If no explicit shares, calculate from investments
  if (shares.length === 0) {
    const investments = await prisma.domainInvestment.findMany({
      where: {
        OR: [
          { targetDomainId: domainId },
          { proposerDomainId: domainId }
        ],
        status: 'ACTIVE'
      },
      include: {
        proposerDomain: { select: { id: true, name: true } },
        targetDomain: { select: { id: true, name: true } }
      }
    })

    let totalExternalShare = 0
    const calculatedShares: VotingShare[] = []

    for (const inv of investments) {
      if (inv.targetDomainId === domainId) {
        // Incoming: Target (this domain) gives power to Proposer via percentageReturn
        if (inv.percentageReturn > 0) {
          calculatedShares.push({
            ownerDomainId: inv.proposerDomainId,
            ownerWing: 'RIGHT', // Default to RIGHT wing (Experts) holding the power
            percentage: inv.percentageReturn,
            ownerDomain: inv.proposerDomain
          })
          totalExternalShare += inv.percentageReturn
        }
      } else {
        // Outgoing: Proposer (this domain) gives power to Target via percentageInvested
        if (inv.percentageInvested > 0) {
          calculatedShares.push({
            ownerDomainId: inv.targetDomainId,
            ownerWing: 'RIGHT', // Default to RIGHT wing
            percentage: inv.percentageInvested,
            ownerDomain: inv.targetDomain
          })
          totalExternalShare += inv.percentageInvested
        }
      }
    }

    // Add the domain itself (Remainder)
    const remainingShare = Math.max(0, 100 - totalExternalShare)
    if (remainingShare > 0) {
      const domain = await prisma.domain.findUnique({ 
        where: { id: domainId }, 
        select: { id: true, name: true } 
      })
      if (domain) {
        calculatedShares.push({
          ownerDomainId: domain.id,
          ownerWing: 'RIGHT',
          percentage: remainingShare,
          ownerDomain: domain
        })
      }
    }
    
    // @ts-ignore
    shares = calculatedShares
  }

  return shares
}

export async function calculateUserVotingWeight(
  userId: string, 
  domainId: string, 
  mode: string = 'STANDARD',
  options?: { targetWing?: string }
): Promise<number> {
  if (mode === 'CANDIDACY') {
     const targetWing = options?.targetWing || 'RIGHT'
     // Shares for the ELECTION (targetWing)
     const shares = await getDomainVotingShares(domainId, targetWing as 'RIGHT' | 'LEFT')
     
     let maxWeight = 0
     const userExperts = await prisma.domainExpert.findMany({
       where: { userId },
       select: { domainId: true, wing: true }
     })
     
     for (const exp of userExperts) {
       // My expert power (exp.domainId, exp.wing)
       // Matches share owner (s.ownerDomainId, s.ownerWing)
       const share = shares.find(s => s.ownerDomainId === exp.domainId && s.ownerWing === exp.wing)
       if (share) {
         maxWeight = Math.max(maxWeight, share.percentage)
       }
     }
     return maxWeight
  }

  if (mode !== 'STRATEGIC' && mode !== 'DIRECT') {
    const isExpert = await prisma.domainExpert.findFirst({
      where: { userId, domainId }
    })
    return isExpert ? 1 : 0
  }

  // STRATEGIC/DIRECT (Content/Proposal Voting)
  // Uses RIGHT wing shares (Experts)
  const shares = await getDomainVotingShares(domainId, 'RIGHT')
  let maxWeight = 0
  
  const userExperts = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true, wing: true }
  })
  
  for (const exp of userExperts) {
    const share = shares.find(s => s.ownerDomainId === exp.domainId && s.ownerWing === exp.wing)
    if (share) {
      maxWeight = Math.max(maxWeight, share.percentage)
    }
  }
  
  return maxWeight
}

export async function calculateVotingResult(
  votes: any[],
  domainId: string,
  mode: string = 'STANDARD'
): Promise<{ approvals: number; rejections: number }> {
  let approvals = 0
  let rejections = 0

  for (const vote of votes) {
    let weight = 0

    if (!domainId) {
      // Root action: Check if Admin
      // Try to find voter ID from common fields
      const voterId = vote.voterId || vote.userId || vote.adminId
      if (voterId) {
        const user = await prisma.user.findUnique({ 
          where: { id: voterId },
          select: { role: true } 
        })
        if (user?.role === 'ADMIN') weight = 100
      }
    } else {
      // If mode is DIRECT, we assume it means weighted voting (STRATEGIC)
      const weightMode = mode === 'DIRECT' ? 'STRATEGIC' : mode
      const voterId = vote.voterId || vote.userId || vote.adminId
      if (voterId) {
        weight = await calculateUserVotingWeight(voterId, domainId, weightMode)
      }
    }

    const voteValue = vote.vote || vote.value || (vote.score > 0 ? 'APPROVE' : 'REJECT') // Handle different schemas
    if (voteValue === 'APPROVE') approvals += weight
    else if (voteValue === 'REJECT') rejections += weight
  }

  return { approvals, rejections }
}

export async function getEffectiveShare(
  ownerDomainId: string,
  targetDomainId: string,
  ownerWing: string,
  targetWing: string
): Promise<number> {
  const shares = await getDomainVotingShares(targetDomainId, targetWing as 'RIGHT' | 'LEFT')
  const myShares = shares.filter(s => s.ownerDomainId === ownerDomainId && s.ownerWing === ownerWing)
  return myShares.reduce((sum, s) => sum + s.percentage, 0)
}
