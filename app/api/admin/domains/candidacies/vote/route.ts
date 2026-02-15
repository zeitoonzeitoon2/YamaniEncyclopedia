import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight, calculateVotingResult } from '@/lib/voting-utils'

const ALLOWED_VOTES = new Set(['APPROVE', 'REJECT'])

async function canVoteOnCandidacy(sessionUser: { id?: string; role?: string } | undefined, domainId: string, targetWing: string) {
  const userId = (sessionUser?.id || '').trim()
  const role = (sessionUser?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN') return { ok: true as const, userId }

  // Check if user has any voting power in the candidacy domain using the new CANDIDACY mode
  const weight = await calculateUserVotingWeight(userId, domainId, 'CANDIDACY', { targetWing })

  return weight > 0 ? { ok: true as const, userId } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const candidacyId = typeof body.candidacyId === 'string' ? body.candidacyId.trim() : ''
    const score = typeof body.score === 'number' ? body.score : 0

    if (!candidacyId || score < 1 || score > 3) {
      return NextResponse.json({ error: 'candidacyId and score (1-3) are required' }, { status: 400 })
    }

    const candidacy = await prisma.expertCandidacy.findUnique({
      where: { id: candidacyId },
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        role: true,
        wing: true,
        status: true,
        roundId: true,
        round: { select: { status: true, endDate: true } }
      },
    })
    if (!candidacy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const roundStatus = candidacy.round?.status || ''
    if (candidacy.status !== 'PENDING' || !['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'].includes(roundStatus)) {
      return NextResponse.json({ error: 'Election round is closed' }, { status: 409 })
    }

    const perm = await canVoteOnCandidacy(session?.user, candidacy.domainId, candidacy.wing)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const voterUserId = perm.userId

    // Calculate multiplier based on voter's role (HEAD gets 2x power)
    let multiplier = 1
    
    if (candidacy.wing === 'RIGHT') {
      // Top-Down: Voter is in Parent Domain
      const domain = await prisma.domain.findUnique({ 
        where: { id: candidacy.domainId },
        select: { parentId: true }
      })
      if (domain?.parentId) {
        const membership = await prisma.domainExpert.findFirst({
          where: { userId: voterUserId, domainId: domain.parentId },
          select: { role: true }
        })
        if (membership?.role === 'HEAD') multiplier = 2
      }
    } else {
      // Bottom-Up: Voter is in a Child Domain (Right wing experts of children vote for Parent Left wing)
      const childMemberships = await prisma.domainExpert.findMany({
        where: {
          userId: voterUserId,
          domain: { parentId: candidacy.domainId },
          wing: 'RIGHT'
        },
        select: { role: true }
      })
      
      if (childMemberships.some(m => m.role === 'HEAD')) {
        multiplier = 2
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Get old score if any
      const existingVote = await tx.candidacyVote.findUnique({
        where: { candidacyId_voterUserId: { candidacyId, voterUserId } }
      })
      const oldScore = existingVote?.score || 0
      const oldWeightedScore = oldScore * multiplier // Assuming multiplier hasn't changed
      
      // Note: If a user's role changed from EXPERT to HEAD between votes, the old score subtraction might be inaccurate
      // regarding the *previous* weight. But we can only approximate or store weight in vote.
      // For now, we assume current multiplier applies to new vote.
      // To be precise, we should probably store the 'weight' or 'multiplier' in CandidacyVote.
      // But user didn't ask for schema change.
      // Let's recalculate old weighted score based on *current* multiplier to be consistent, 
      // or just use the new score * multiplier - oldScore * multiplier.
      // Yes, (score - oldScore) * multiplier.

      // 2. Upsert vote
      await tx.candidacyVote.upsert({
        where: { candidacyId_voterUserId: { candidacyId, voterUserId } },
        update: { score },
        create: { candidacyId, voterUserId, score, vote: 'APPROVE' },
      })

      // 3. Update totalScore in candidacy
      await tx.expertCandidacy.update({
        where: { id: candidacyId },
        data: {
          totalScore: {
            increment: (score - oldScore) * multiplier
          }
        }
      })
    })

    return NextResponse.json({
      success: true,
      newScore: score
    })
  } catch (error) {
    console.error('Error voting candidacy:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
