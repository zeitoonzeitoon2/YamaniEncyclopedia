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
