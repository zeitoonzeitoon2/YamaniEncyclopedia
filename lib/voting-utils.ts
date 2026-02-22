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
  // 1. Calculate shares from investments (Dynamic)
  // Status Logic:
  // - ACTIVE: Proposer gives power to Target (percentageInvested). Return is not yet realized.
  // - COMPLETED/RETURNED: Principal is returned. Proposer gets profit (percentageReturn) from Target.
  const investments = await prisma.domainInvestment.findMany({
    where: {
      OR: [
        { targetDomainId: domainId },
        { proposerDomainId: domainId }
      ],
      status: { in: ['ACTIVE', 'COMPLETED', 'RETURNED'] }
    },
    include: {
      proposerDomain: { select: { id: true, name: true } },
      targetDomain: { select: { id: true, name: true } }
    }
  })

  let totalExternalShare = 0
  const calculatedShares: VotingShare[] = []

  for (const inv of investments) {
    // Case 1: We are the Target (Receiver). Proposer invested in us.
    // - ACTIVE: We don't give power to Proposer yet.
    // - COMPLETED: We give `percentageReturn` (Profit) to Proposer.
    if (inv.targetDomainId === domainId) {
      if ((inv.status === 'COMPLETED' || inv.status === 'RETURNED') && inv.percentageReturn > 0) {
        calculatedShares.push({
          ownerDomainId: inv.proposerDomainId,
          ownerWing: inv.proposerWing, // The wing that invested gets the return power
          percentage: inv.percentageReturn,
          ownerDomain: inv.proposerDomain
        })
        totalExternalShare += inv.percentageReturn
      }
    }
    
    // Case 2: We are the Proposer (Giver). We invested in Target.
    // - ACTIVE: We give `percentageInvested` of OUR power to Target.
    // - COMPLETED: We get our power back (so Target has 0 share of us).
    else if (inv.proposerDomainId === domainId) {
      if (inv.status === 'ACTIVE' && inv.percentageInvested > 0) {
        calculatedShares.push({
          ownerDomainId: inv.targetDomainId,
          ownerWing: inv.targetWing, // Target gets the power
          percentage: inv.percentageInvested,
          ownerDomain: inv.targetDomain
        })
        totalExternalShare += inv.percentageInvested
      }
    }
  }

  // Deduplicate shares (in case multiple investments exist between same pair)
  const aggregatedShares: VotingShare[] = []
  for (const share of calculatedShares) {
    const existing = aggregatedShares.find(s => s.ownerDomainId === share.ownerDomainId && s.ownerWing === share.ownerWing)
    if (existing) {
      existing.percentage += share.percentage
    } else {
      aggregatedShares.push(share)
    }
  }
  
  // Recalculate totalExternalShare based on aggregated
  totalExternalShare = aggregatedShares.reduce((sum, s) => sum + s.percentage, 0)

  // Add the domain itself (Remainder)
  // Always default to Self-Right if not distributed.
  if (totalExternalShare < 100) {
    const remainingShare = 100 - totalExternalShare
    const domain = await prisma.domain.findUnique({ 
      where: { id: domainId }, 
      select: { id: true, name: true } 
    })
    
    if (domain) {
      const existingSelf = aggregatedShares.find(s => s.ownerDomainId === domain.id && s.ownerWing === 'RIGHT')
      if (existingSelf) {
        existingSelf.percentage += remainingShare
      } else {
        aggregatedShares.push({
          ownerDomainId: domain.id,
          ownerWing: 'RIGHT', // Default 100% to Right Team
          percentage: remainingShare,
          ownerDomain: domain
        })
      }
    }
  }

  return aggregatedShares
}

export async function calculateUserVotingWeight(
  userId: string, 
  domainId: string, 
  mode: string = 'STANDARD',
  options?: { targetWing?: string }
): Promise<number> {
  // 1. CANDIDACY MODE (Voting for a Candidate)
  if (mode === 'CANDIDACY') {
     const targetWing = (options?.targetWing || 'RIGHT').toUpperCase()
     
     // Fetch Domain Relations (Parent/Children) to determine Eligibility
     const domain = await prisma.domain.findUnique({
       where: { id: domainId },
       include: {
         parent: { select: { id: true, name: true } },
         children: { select: { id: true, name: true } }
       }
     })

     if (!domain) return 0

     // Fetch Universal Shares of the Domain
     // (We ask for 'RIGHT' but the function currently returns all shares regardless of wing arg, 
     //  checking both Right and Left investors)
     const shares = await getDomainVotingShares(domainId, 'RIGHT')
     
     // Determine Eligible Voter Groups based on Governance Rules
     let eligibleGroups: { domainId: string, wing: string }[] = []

     if (targetWing === 'RIGHT') {
       // RULE: Election of RIGHT Team
       if (!domain.parent) {
         // ROOT EXCEPTION: Root Domain's Right Team is self-appointed (or votes for itself)
         // We allow Self-Right to vote.
         eligibleGroups.push({ domainId: domainId, wing: 'RIGHT' })
       } else {
         // SUB-DOMAINS: Competition between Direct Parent Right & Direct Parent Left
         eligibleGroups.push({ domainId: domain.parent.id, wing: 'RIGHT' })
         eligibleGroups.push({ domainId: domain.parent.id, wing: 'LEFT' })
       }
     } else {
       // RULE: Election of LEFT Team
       // Competition between Self Right & Direct Children Right
       // Note: Even for Root Domain, Left Team is elected by Self Right + Children Right
       eligibleGroups.push({ domainId: domainId, wing: 'RIGHT' })
       
       if (domain.children && domain.children.length > 0) {
         for (const child of domain.children) {
           eligibleGroups.push({ domainId: child.id, wing: 'RIGHT' })
         }
       }
     }

     // Calculate Max Weight for User based on Eligible Groups
     let maxWeight = 0
     
     // Determine total percentage owned by ALL Eligible Groups (for relative weighting)
     // This is the Denominator for calculating Relative Power.
     let totalEligibleSharePercentage = 0
     
     // We need to fetch the share percentage for ALL eligible groups, not just the user's.
     for (const group of eligibleGroups) {
        const groupShare = shares.find(s => 
           s.ownerDomainId === group.domainId && 
           (s.ownerWing || '').toUpperCase() === group.wing
        )
        if (groupShare) {
          totalEligibleSharePercentage += groupShare.percentage
        }
     }
     
     // Prevent division by zero
     if (totalEligibleSharePercentage === 0) totalEligibleSharePercentage = 1

     // Get User's Expert Positions
     const userExperts = await prisma.domainExpert.findMany({
       where: { userId },
       select: { domainId: true, wing: true }
     })
     
     for (const exp of userExperts) {
       const expWing = (exp.wing || '').toUpperCase()
       const expDomainId = exp.domainId
       
       // Check if this Expert position is Eligible to vote
       const isEligible = eligibleGroups.some(g => g.domainId === expDomainId && g.wing === expWing)
       
       if (isEligible) {
         // Find the Share owned by this Eligible Group
         const share = shares.find(s => 
           s.ownerDomainId === expDomainId && 
           (s.ownerWing || '').toUpperCase() === expWing
         )
         
         if (share) {
           // Calculate RELATIVE WEIGHT
           // Formula: (Group's Share / Total Eligible Share) * 100
           const relativeWeight = (share.percentage / totalEligibleSharePercentage) * 100
           maxWeight = Math.max(maxWeight, relativeWeight)
         }
       }
     }
     
     return maxWeight
  }

  // 2. STANDARD MODE (Expert Check)
  if (mode !== 'STRATEGIC' && mode !== 'DIRECT') {
    const isExpert = await prisma.domainExpert.findFirst({
      where: { userId, domainId }
    })
    return isExpert ? 1 : 0
  }

  // 3. STRATEGIC/DIRECT MODE (Content/Proposal Voting)
  // Uses RIGHT wing shares (Experts) by default, or specific logic if needed.
  // Currently assuming Content Voting uses the Domain's Right Wing Logic (Self-Governance).
  const shares = await getDomainVotingShares(domainId, 'RIGHT')
  let maxWeight = 0
  
  const userExperts = await prisma.domainExpert.findMany({
    where: { userId },
    select: { domainId: true, wing: true }
  })
  
  for (const exp of userExperts) {
    const expWing = (exp.wing || '').toUpperCase()
    const share = shares.find(s => s.ownerDomainId === exp.domainId && (s.ownerWing || '').toUpperCase() === expWing)
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

export async function getAvailableVotingPower(
  domainId: string,
  wing: string
): Promise<number> {
  // Calculate total power consumed by ACTIVE investments
  const investments = await prisma.domainInvestment.findMany({
    where: {
      OR: [
        { proposerDomainId: domainId, proposerWing: wing },
        { targetDomainId: domainId, targetWing: wing }
      ],
      status: 'ACTIVE'
    }
  })

  let usedPower = 0
  for (const inv of investments) {
    if (inv.proposerDomainId === domainId && inv.proposerWing === wing) {
      usedPower += inv.percentageInvested
    }
    if (inv.targetDomainId === domainId && inv.targetWing === wing) {
      usedPower += inv.percentageReturn
    }
  }

  // Also consider Explicit Shares?
  // If Explicit Shares exist, they might define a "Hard Cap" on what the domain owns of itself?
  // But generally, Explicit Shares are the "Result" of distribution, not the "Consumption".
  // However, if there are Explicit Shares allocating 100% to Parent, then the Domain technically has 0% to invest.
  // BUT, if the user wants to allow the domain to invest, we assume the Investment overrides Explicit Shares.
  // The only thing that strictly limits capacity is *other* Active Investments.
  
  return Math.max(0, 100 - usedPower)
}

export async function settleExpiredInvestments() {
  const now = new Date()
  const result = await prisma.domainInvestment.updateMany({
    where: {
      status: 'ACTIVE',
      endDate: { lt: now }
    },
    data: {
      status: 'COMPLETED'
    }
  })
  return { count: result.count }
}

export async function forceTerminateInvestment(investmentId: string) {
  return await prisma.domainInvestment.update({
    where: { id: investmentId },
    data: { status: 'COMPLETED' }
  })
}
