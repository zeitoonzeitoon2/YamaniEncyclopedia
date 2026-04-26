import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight } from '@/lib/voting-utils'

const ALLOWED_ROLES = new Set(['HEAD', 'EXPERT'])

async function hasAnyDomainExpertMembership(userId: string) {
  const m = await prisma.domainExpert.findFirst({ where: { userId }, select: { id: true } })
  return !!m
}

async function canProposeCandidacy(userId: string, domainId: string, targetWing: string, userRole?: string) {
  if (userRole === 'ADMIN') return { ok: true as const }

  // 1. Check if user is expert in the target domain itself
  const isMemberOfDomain = await prisma.domainExpert.findFirst({
    where: { userId, domainId },
    select: { id: true }
  })
  if (isMemberOfDomain) return { ok: true as const }

  if (targetWing === 'RIGHT') {
    // For RIGHT team: Right and Left teams of the PARENT domain(s)
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { 
        parentId: true,
        parentLinks: { select: { parentDomainId: true } }
      }
    })
    
    const parentIds: string[] = []
    if (domain?.parentId) parentIds.push(domain.parentId)
    if (domain?.parentLinks) parentIds.push(...domain.parentLinks.map(l => l.parentDomainId))
    
    if (parentIds.length > 0) {
      const isMemberOfParent = await prisma.domainExpert.findFirst({
        where: {
          userId,
          domainId: { in: parentIds },
          wing: { in: ['RIGHT', 'LEFT'] }
        },
        select: { id: true }
      })
      if (isMemberOfParent) return { ok: true as const }
    }
  } else if (targetWing === 'LEFT') {
    // For LEFT team: Right teams of SUB-DOMAINS
    const isRightMemberOfChild = await prisma.domainExpert.findFirst({
      where: {
        userId,
        wing: 'RIGHT',
        domain: {
          OR: [
            { parentId: domainId },
            { parentLinks: { some: { parentDomainId: domainId } } }
          ]
        }
      },
      select: { id: true }
    })
    if (isRightMemberOfChild) return { ok: true as const }
  }

  return { ok: false as const, status: 403 as const, error: 'Only authorized voting members and domain experts can propose candidates' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    // ... existing permission check ...
    if (role !== 'ADMIN' && role !== 'EXPERT') {
      const ok = await hasAnyDomainExpertMembership(userId)
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 })

    // Calculate weights safely
    let weightRight = 0
    let weightLeft = 0
    try {
      weightRight = await calculateUserVotingWeight(userId, domainId, 'CANDIDACY', { targetWing: 'RIGHT' })
    } catch (err) {
      console.error('[candidacies GET] weightRight error:', err)
    }
    try {
      weightLeft = await calculateUserVotingWeight(userId, domainId, 'CANDIDACY', { targetWing: 'LEFT' })
    } catch (err) {
      console.error('[candidacies GET] weightLeft error:', err)
    }

    const canVoteRight = role === 'ADMIN' || weightRight > 0
    const canVoteLeft = role === 'ADMIN' || weightLeft > 0

    console.log(`[API] userVotingRights for ${userId}: RIGHT=${weightRight}(${canVoteRight}), LEFT=${weightLeft}(${canVoteLeft})`)

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
            score: true,
          } 
        },
      },
    })

    const candidaciesWithWeightedScore = candidacies.map(c => {
      // Use totalScore for now (stored in DB after each vote)
      const weightedScore = Math.round((c.totalScore || 0) * 100) / 100
      return { ...c, weightedScore }
    })

    return NextResponse.json({ 
      candidacies: candidaciesWithWeightedScore,
      userVotingRights: {
        RIGHT: { canVote: canVoteRight, weight: weightRight },
        LEFT: { canVote: canVoteLeft, weight: weightLeft }
      }
    })
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

    let candidacy
    try {
      candidacy = await prisma.expertCandidacy.create({
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
    } catch (createError: any) {
      // Handle unique constraint violation (old DB schema has @@unique([domainId, candidateUserId]))
      // This happens when the same user was previously nominated in a past round
      if (createError?.code === 'P2002') {
        // Find the old record and update it for the new round
        const oldCandidacy = await prisma.expertCandidacy.findFirst({
          where: { domainId, candidateUserId }
        })
        if (oldCandidacy) {
          candidacy = await prisma.expertCandidacy.update({
            where: { id: oldCandidacy.id },
            data: {
              proposerUserId: userId,
              role: roleValue,
              wing: wingVal,
              roundId: activeRound.id,
              status: 'PENDING',
              totalScore: 0
            }
          })
          // Remove old votes since this is a new round
          await prisma.candidacyVote.deleteMany({ where: { candidacyId: oldCandidacy.id } })
        } else {
          throw createError
        }
      } else {
        throw createError
      }
    }

    return NextResponse.json({ candidacy })
  } catch (error) {
    console.error('Error creating candidacy:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
