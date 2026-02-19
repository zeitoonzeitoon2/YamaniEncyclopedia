import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDomainVotingShares } from '@/lib/voting-utils'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    const wing = (searchParams.get('wing') || '').trim()

    if (!domainId || !wing) {
      return NextResponse.json({ error: 'domainId and wing are required' }, { status: 400 })
    }

    if (!['RIGHT', 'LEFT'].includes(wing)) {
      return NextResponse.json({ error: 'Invalid wing' }, { status: 400 })
    }

    // 1. Find active election round
    const activeRound = await prisma.electionRound.findFirst({
      where: {
        domainId,
        wing: wing as 'RIGHT' | 'LEFT',
        status: { in: ['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'] }
      }
    })

    // 2. Get Voting Shares using the helper
    // NOTE: This helper returns ALL shares (who owns what).
    // We must FILTER this list to show only ELIGIBLE VOTERS for the current election.
    const shares = await getDomainVotingShares(domainId, 'RIGHT') // 'RIGHT' logic is universal for share calculation
    
    // Determine Eligible Voter Groups based on Governance Rules (Copied from voting-utils)
    // TODO: Ideally refactor this logic into a shared helper `getEligibleVoterGroups(domainId, wing)`
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } }
      }
    })

    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

    let eligibleGroups: { domainId: string, wing: string }[] = []
    const targetWing = wing.toUpperCase()

    if (targetWing === 'RIGHT') {
      // RULE: Election of RIGHT Team
      if (!domain.parent) {
        // ROOT EXCEPTION: Root Domain's Right Team is self-appointed
        eligibleGroups.push({ domainId: domainId, wing: 'RIGHT' })
      } else {
        // SUB-DOMAINS: Competition between Direct Parent Right & Direct Parent Left
        eligibleGroups.push({ domainId: domain.parent.id, wing: 'RIGHT' })
        eligibleGroups.push({ domainId: domain.parent.id, wing: 'LEFT' })
      }
    } else {
      // RULE: Election of LEFT Team
      // Competition between Self Right & Direct Children Right
      eligibleGroups.push({ domainId: domainId, wing: 'RIGHT' })
      
      if (domain.children && domain.children.length > 0) {
        for (const child of domain.children) {
          eligibleGroups.push({ domainId: child.id, wing: 'RIGHT' })
        }
      }
    }

    // Filter shares to include ONLY eligible groups
    // CRITICAL FIX: Match both ID and Wing!
    // Also need to handle 'LEFT' vs 'left' case sensitivity if needed (though usually normalized)
    const eligibleShares = shares.filter(s => 
      eligibleGroups.some(g => 
        g.domainId === s.ownerDomainId && 
        (g.wing || '').toUpperCase() === (s.ownerWing || '').toUpperCase()
      )
    )

    // Calculate Total Eligible Percentage for Relative Weighting
    let totalEligiblePercentage = eligibleShares.reduce((sum, s) => sum + s.percentage, 0)
    
    // Safety check: if total is 0 (e.g. no shares assigned yet), prevent division by zero
    if (totalEligiblePercentage === 0) totalEligiblePercentage = 1

    const results = []

    for (const share of eligibleShares) {
      // Calculate Relative Power
      const relativePower = (share.percentage / totalEligiblePercentage) * 100

      // 3. Count total experts in the Owner Team (voters)
      const totalExperts = await prisma.domainExpert.count({
        where: {
          domainId: share.ownerDomainId,
          wing: share.ownerWing
        }
      })

      // 4. Count how many of these experts have voted in this round
      let votedCount = 0
      if (activeRound) {
        const voters = await prisma.candidacyVote.findMany({
          where: {
            candidacy: {
              roundId: activeRound.id
            },
            voterUser: {
              domainExperts: {
                some: {
                  domainId: share.ownerDomainId,
                  wing: share.ownerWing
                }
              }
            }
          },
          distinct: ['voterUserId'],
          select: {
            voterUserId: true
          }
        })
        votedCount = voters.length
      }

      results.push({
        ownerDomainId: share.ownerDomainId,
        ownerDomainName: share.ownerDomain.name,
        ownerWing: share.ownerWing,
        percentage: relativePower, // Return RELATIVE POWER instead of absolute share
        rawShare: share.percentage, // Optional: keep raw share if needed for debugging
        totalExperts,
        votedExperts: votedCount
      })
    }

    return NextResponse.json({
      status: activeRound ? 'ACTIVE' : 'IDLE',
      roundId: activeRound?.id || null,
      shares: results
    })

  } catch (error) {
    console.error('Error fetching election status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
