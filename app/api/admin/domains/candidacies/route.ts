import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDomainVotingShares } from '@/lib/voting-utils'

const ALLOWED_ROLES = new Set(['HEAD', 'EXPERT'])

async function hasAnyDomainExpertMembership(userId: string) {
  const m = await prisma.domainExpert.findFirst({ where: { userId }, select: { id: true } })
  return !!m
}

async function canProposeCandidacy(userId: string, domainId: string, targetWing: string, userRole?: string) {
  if (userRole === 'ADMIN') return { ok: true as const }

  // New logic per user request:
  // "همه اعضای یک حوزه و زیرحوزه های مستقیمش بتونن برای عضویت در تیم راست یا چپ یک حوزه نامزد معرفی کنند"
  // "All members of a domain and its direct sub-domains can propose candidates for membership in the Right or Left team of a domain"

  // 1. Check if user is expert in the target domain itself
  const isMemberOfDomain = await prisma.domainExpert.findFirst({
    where: { userId, domainId },
    select: { id: true }
  })
  if (isMemberOfDomain) return { ok: true as const }

  // 2. Check if user is expert in any direct child domain of the target domain
  const isMemberOfChild = await prisma.domainExpert.findFirst({
    where: {
      userId,
      domain: { parentId: domainId }
    },
    select: { id: true }
  })
  if (isMemberOfChild) return { ok: true as const }

  return { ok: false as const, status: 403 as const, error: 'Only members of this domain or its sub-domains can propose candidates' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    if (role !== 'ADMIN' && role !== 'EXPERT') {
      const ok = await hasAnyDomainExpertMembership(userId)
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 })

    const candidacies = await prisma.expertCandidacy.findMany({
      where: { domainId, status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        proposerUserId: true,
        role: true,
        wing: true,
        status: true,
        roundId: true,
        totalScore: true,
        createdAt: true,
        domain: { select: { name: true } },
        candidateUser: { select: { name: true, email: true } },
        proposerUser: { select: { name: true, email: true } },
        votes: { 
          select: { 
            voterUserId: true, 
            vote: true, 
            score: true,
            voterUser: {
              select: {
                domainExperts: {
                  select: { domainId: true, wing: true }
                }
              }
            }
          } 
        },
      },
    })

    // Calculate Weighted Scores
    // Fetch shares for both wings (memoized)
    const [sharesRight, sharesLeft] = await Promise.all([
      getDomainVotingShares(domainId, 'RIGHT'),
      getDomainVotingShares(domainId, 'LEFT')
    ])

    const candidaciesWithWeightedScore = candidacies.map(c => {
      const shares = c.wing === 'RIGHT' ? sharesRight : sharesLeft
      let weightedScore = 0

      // Calculate weighted score based on voter's share
      if (shares.length > 0) {
        for (const vote of c.votes) {
          let maxShare = 0
          // Check all expert memberships of the voter
          // @ts-ignore
          const experts = vote.voterUser?.domainExperts || []
          for (const exp of experts) {
            // Find if this expert membership corresponds to a share owner
            const share = shares.find(s => s.ownerDomainId === exp.domainId && s.ownerWing === exp.wing)
            if (share) {
              maxShare = Math.max(maxShare, share.percentage)
            }
          }
          
          // Add weighted score: VoteScore * (Share / 100)
          weightedScore += (vote.score || 0) * (maxShare / 100)
        }
      } else {
        // Fallback (should not happen due to default share logic)
        weightedScore = c.totalScore
      }

      // Round to 2 decimal places for display
      weightedScore = Math.round(weightedScore * 100) / 100

      return { ...c, weightedScore }
    })

    return NextResponse.json({ candidacies: candidaciesWithWeightedScore })
  } catch (error) {
    console.error('Error fetching candidacies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const domainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''
    const candidateUserId = typeof body.candidateUserId === 'string' ? body.candidateUserId.trim() : ''
    const requestedRole = typeof body.role === 'string' ? body.role.trim() : ''
    let roleValue = requestedRole || 'EXPERT'
    const requestedWing = typeof body.wing === 'string' ? body.wing.trim() : ''
    const wingValue = requestedWing || 'RIGHT'
    const wingVal = (wingValue === 'LEFT' ? 'LEFT' : 'RIGHT') as 'RIGHT' | 'LEFT'

    if (!domainId || !candidateUserId) {
      return NextResponse.json({ error: 'domainId and candidateUserId are required' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.has(roleValue)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Find active election round for this domain and wing
    const activeRound = await prisma.electionRound.findFirst({
      where: {
        domainId,
        wing: wingVal,
        status: { in: ['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'] }
      }
    })

    if (!activeRound) {
      return NextResponse.json({ error: 'No active election round for this wing' }, { status: 400 })
    }

    // Force role based on round status
    // If status is HEAD_ACTIVE, role is HEAD. Otherwise (MEMBERS_ACTIVE or ACTIVE), role is EXPERT.
    roleValue = activeRound.status === 'HEAD_ACTIVE' ? 'HEAD' : 'EXPERT'

    const now = new Date()
    if (now < activeRound.startDate) {
      return NextResponse.json({ error: 'electionNotStarted' }, { status: 400 })
    }
    if (now > activeRound.endDate) {
      return NextResponse.json({ error: 'nominationPeriodEnded' }, { status: 400 })
    }

    if (role !== 'ADMIN') {
      const perm = await canProposeCandidacy(userId, domainId, wingVal, role)
      if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })
    } else {
      const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { parentId: true } })
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    const [candidate, existingExpert] = await Promise.all([
      prisma.user.findUnique({ where: { id: candidateUserId }, select: { id: true } }),
      prisma.domainExpert.findFirst({ where: { domainId, userId: candidateUserId }, select: { id: true, wing: true } }),
    ])

    if (!candidate) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    
    // For HEAD election, candidate MUST be an existing expert of the same wing.
    if (roleValue === 'HEAD') {
      if (!existingExpert || existingExpert.wing !== wingVal) {
        return NextResponse.json({ error: 'Candidate must be an expert of this wing to be Head' }, { status: 400 })
      }
    }

    // Check if already proposed in this round
    const existingCandidacy = await prisma.expertCandidacy.findFirst({
      where: {
        domainId,
        candidateUserId,
        roundId: activeRound.id,
        status: { not: 'REJECTED' }
      }
    })

    if (existingCandidacy) {
      return NextResponse.json({ error: 'User is already a candidate in this round' }, { status: 400 })
    }

    const candidacy = await prisma.expertCandidacy.create({
      data: {
        domainId,
        candidateUserId,
        proposerUserId: userId,
        role: roleValue,
        wing: wingVal,
        roundId: activeRound.id,
        status: 'PENDING',
        totalScore: 0
      }
    })

    return NextResponse.json({ candidacy })
  } catch (error) {
    console.error('Error creating candidacy:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
