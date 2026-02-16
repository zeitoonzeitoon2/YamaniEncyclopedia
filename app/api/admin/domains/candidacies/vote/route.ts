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

  return weight > 0 ? { ok: true as const, userId, weight } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
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
    const voterWeight = perm.weight || 0

    await prisma.$transaction(async (tx) => {
      // 1. Get old score if any
      const existingVote = await tx.candidacyVote.findUnique({
        where: { candidacyId_voterUserId: { candidacyId, voterUserId } }
      })
      
      const oldRawScore = existingVote?.score || 0
      // We assume the voter's weight hasn't changed significantly between votes
      // or we accept the slight inaccuracy. Ideally we'd store the applied weight.
      const oldWeightedScore = Math.round(oldRawScore * voterWeight)
      const newWeightedScore = Math.round(score * voterWeight)
      
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
            increment: newWeightedScore - oldWeightedScore
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
