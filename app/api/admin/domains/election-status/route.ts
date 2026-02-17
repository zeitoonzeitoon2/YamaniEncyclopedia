import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

    if (!activeRound) {
      return NextResponse.json({ status: 'NO_ELECTION' })
    }

    // 2. Get Voting Shares for this election (domainId + wing)
    // Who holds the voting power for this election?
    // domainId = The domain having the election (e.g. Philosophy)
    // domainWing = The wing having the election (e.g. LEFT)
    const shares = await prisma.domainVotingShare.findMany({
      where: {
        domainId,
        domainWing: wing
      },
      include: {
        ownerDomain: { select: { id: true, name: true } }
      }
    })

    // If no explicit shares defined, assume 100% owned by the same domain's opposite wing for LEFT, or same for RIGHT?
    // User said: "For Left Team elections, voters are Right Team of that domain..."
    // Let's add a default if shares are empty.
    let effectiveShares = shares

    if (effectiveShares.length === 0) {
      // Default: The domain itself owns 100% of the voting power.
      // For LEFT wing election, the voters are RIGHT wing experts.
      // For RIGHT wing election, the voters are RIGHT wing experts (usually).
      const ownerWing = 'RIGHT' 
      
      effectiveShares = [{
        id: 'default',
        domainId,
        domainWing: wing,
        ownerDomainId: domainId,
        ownerWing: ownerWing,
        percentage: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerDomain: {
          id: domainId,
          // We need to fetch the name if it's not in the include. 
          // But since we are inside the domain, we can just use the domain's name if we had it.
          // Let's fetch domain name separately if needed, or just let the loop handle it.
          name: '', // Will be fetched below or we need to fetch it now.
        }
      }] as any // casting for simplicity, or we fetch domain name
      
      const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { name: true } })
      if (domain && effectiveShares[0]) {
        effectiveShares[0].ownerDomain.name = domain.name
      }
    }

    const results = []

    for (const share of effectiveShares) {
      // 3. Count total experts in the Owner Team (voters)
      const totalExperts = await prisma.domainExpert.count({
        where: {
          domainId: share.ownerDomainId,
          wing: share.ownerWing
        }
      })

      // 4. Count how many of these experts have voted in this round
      // A voter is someone who has cast at least one vote for any candidacy in this round.
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

      results.push({
        ownerDomainId: share.ownerDomainId,
        ownerDomainName: share.ownerDomain.name,
        ownerWing: share.ownerWing,
        percentage: share.percentage,
        totalExperts,
        votedExperts: voters.length
      })
    }

    return NextResponse.json({
      status: 'ACTIVE',
      roundId: activeRound.id,
      shares: results
    })

  } catch (error) {
    console.error('Error fetching election status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
