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
    const shares = await getDomainVotingShares(domainId, wing as 'RIGHT' | 'LEFT')

    const results = []

    for (const share of shares) {
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
        percentage: share.percentage,
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
