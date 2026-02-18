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
    if (wing === 'RIGHT') {
      // Election for RIGHT Team (Executive/Main) - e.g. Social Sciences
      // Rule: Parent Domain (Proposer) votes for Child Domain (Target)
      // Logic: Incoming Investment (target === domainId)
      if (inv.targetDomainId === domainId) {
        // Use percentageInvested (The amount Parent invested in Child)
        if (inv.percentageInvested > 0) {
          calculatedShares.push({
            ownerDomainId: inv.proposerDomainId,
            ownerWing: inv.proposerWing, // Use the specific wing that invested
            percentage: inv.percentageInvested,
            ownerDomain: inv.proposerDomain
          })
          totalExternalShare += inv.percentageInvested
        }
      }
    } else {
      // Election for LEFT Team (Legislative/Supervisory) - e.g. Philosophy
      // Rule: Child Domains (Targets) vote for Parent Domain (Proposer)
      // Logic: Outgoing Investment (proposer === domainId)
      if (inv.proposerDomainId === domainId) {
        // Use percentageReturn (The amount Child votes in Parent)
        // Note: If percentageReturn is 0, check if we should use percentageInvested instead? 
        // For now, sticking to percentageReturn as per schema 'Target power given to Proposer' logic
        if (inv.percentageReturn > 0) {
          calculatedShares.push({
            ownerDomainId: inv.targetDomainId,
            ownerWing: inv.targetWing, // Use the specific wing of the target
            percentage: inv.percentageReturn,
            ownerDomain: inv.targetDomain
          })
          totalExternalShare += inv.percentageReturn
        }
      }
    }
  }

  // Add the domain itself (Remainder) if there are investments calculated
  if (calculatedShares.length > 0) {
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
    return calculatedShares
  }

  // 2. Fallback to explicit Voting Shares
  const shares = await prisma.domainVotingShare.findMany({
    where: {
      domainId,
      domainWing: wing
    },
    include: {
      ownerDomain: { select: { id: true, name: true } }
    }
  })

  if (shares.length > 0) {
    return shares as VotingShare[]
  }

  // 3. If no shares found (explicit or implicit), return 100% self share
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true }
  })
  
  if (domain) {
    return [{
      ownerDomainId: domain.id,
      ownerWing: wing, // Self-ownership: LEFT owns LEFT, RIGHT owns RIGHT
      percentage: 100,
      ownerDomain: domain
    }]
  }

  return []
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
