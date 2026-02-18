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
  // 1. Calculate shares from active investments first (Dynamic)
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
    // Determine which share value to use based on the relationship
    // Investments affect BOTH Right and Left wing elections of the Domain (Total Power)
    // unless we decide otherwise. For now, we assume "Voting Power" is universal.
    
    // Case 1: We are the Target (Receiver). Proposer invested in us.
    // Proposer gets `percentageInvested` of our power.
    if (inv.targetDomainId === domainId) {
      if (inv.percentageInvested > 0) {
        calculatedShares.push({
          ownerDomainId: inv.proposerDomainId,
          ownerWing: inv.proposerWing, // The wing that invested gets the power
          percentage: inv.percentageInvested,
          ownerDomain: inv.proposerDomain
        })
        totalExternalShare += inv.percentageInvested
      }
    }
    
    // Case 2: We are the Proposer (Giver). Target returns power to us.
    // Target gets `percentageReturn` of our power.
    // Wait. `percentageReturn` is "Percentage of Target's power given to Proposer".
    // It means Proposer gets power IN Target.
    // It does NOT mean Target gets power in Proposer.
    // So if we are the Proposer (inv.proposerDomainId === domainId),
    // does this investment reduce OUR voting power?
    // User said: "Social Sciences Right team can give 20% of Social Sciences shares to Philosophy".
    // This implies Social Sciences (Proposer?) gives to Philosophy (Target?).
    // If Social Sciences gives 20% OF ITSELF, then Social Sciences is the "Target" of the power distribution?
    // But usually Proposer initiates.
    // If Social Sciences says "I want to give you 20% of me", Social Sciences is Proposer of the transaction.
    // But in the Investment Model:
    // `percentageInvested` = Proposer's power given to Target?
    // OR Proposer's Money given for Target's Equity?
    
    // Let's rely on the schema comments which seemed to align with user description:
    // "Percentage of Proposer's power given to Target"
    // So if I am Proposer, I am giving away my power. Target GETS my power.
    else if (inv.proposerDomainId === domainId) {
      if (inv.percentageInvested > 0) {
        calculatedShares.push({
          ownerDomainId: inv.targetDomainId,
          ownerWing: inv.targetWing, // Target gets the power
          percentage: inv.percentageInvested,
          ownerDomain: inv.targetDomain
        })
        totalExternalShare += inv.percentageInvested
      }
    }
    // Note: `percentageReturn` is irrelevant for calculating *Proposer's* voting distribution
    // because `percentageReturn` is about Target giving power back to Proposer.
    // So `percentageReturn` affects *Target's* voting distribution (Case 1 above).
    // Wait, in Case 1 (We are Target), Proposer gets `percentageInvested`?
    // NO.
    // If `percentageInvested` is "Proposer's power given to Target", then:
    // Proposer (Giver) -> Target (Receiver).
    // Proposer LOSES power. Target GAINS power in Proposer.
    
    // Let's re-read User: "Right team... can give... to Philosophy Left team".
    // This implies Transfer of Power.
    // If A gives to B. B has power in A.
    
    // So:
    // If I am A (Proposer): I give `percentageInvested` to B.
    // B (Target) owns `percentageInvested` of ME.
    // So when calculating SHARES OF A:
    // Include B as owner.
    
    // If I am B (Target): A gives `percentageInvested` to me.
    // I own shares in A. This doesn't affect SHARES OF B.
    // UNLESS `percentageReturn` exists.
    // `percentageReturn`: "Percentage of Target's power given to Proposer".
    // So B gives `percentageReturn` to A.
    // A (Proposer) owns `percentageReturn` of B.
    // So when calculating SHARES OF B:
    // Include A as owner.
  }

  // Deduplicate shares (in case multiple investments exist between same pair)
  // (Simplified for now, assuming unique pair logic or additive)
  // Ideally we should sum up if multiple entries exist for same owner/wing.
  
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
      // Check if Self-Right is already in aggregatedShares (unlikely but possible if circular?)
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
  if (mode === 'CANDIDACY') {
     const targetWing = options?.targetWing || 'RIGHT'
     // Shares for the ELECTION (targetWing)
     const shares = await getDomainVotingShares(domainId, targetWing as 'RIGHT' | 'LEFT')
     
     console.log(`[DEBUG] calculateUserVotingWeight userId=${userId} domainId=${domainId} targetWing=${targetWing}`)
     console.log(`[DEBUG] shares:`, JSON.stringify(shares, null, 2))

     let maxWeight = 0
     const userExperts = await prisma.domainExpert.findMany({
       where: { userId },
       select: { domainId: true, wing: true }
     })
     console.log(`[DEBUG] userExperts:`, JSON.stringify(userExperts, null, 2))
     
     for (const exp of userExperts) {
       const expWing = (exp.wing || '').toUpperCase()
       const expDomainId = exp.domainId
       
       console.log(`[DEBUG] Checking expert domain=${expDomainId} wing=${expWing}`)
       
       const share = shares.find(s => {
         const shareDomainId = s.ownerDomainId
         const shareWing = (s.ownerWing || '').toUpperCase()
         const match = shareDomainId === expDomainId && shareWing === expWing
         if (match) {
            console.log(`[DEBUG] Found matching share! shareDomainId=${shareDomainId} shareWing=${shareWing} percentage=${s.percentage}`)
         }
         return match
       })
       
       if (share) {
         console.log(`[DEBUG] Match confirmed. Adding weight: ${share.percentage}`)
         maxWeight = Math.max(maxWeight, share.percentage)
       }
     }
     console.log(`[DEBUG] Result maxWeight=${maxWeight}`)
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
