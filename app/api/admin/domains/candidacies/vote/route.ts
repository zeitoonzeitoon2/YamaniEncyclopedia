import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight } from '@/lib/voting-utils'

// Remove ALLOWED_VOTES as we use score now

async function canVoteOnCandidacy(sessionUser: { id?: string; role?: string } | undefined, domainId: string, targetWing: string) {
  const userId = (sessionUser?.id || '').trim()
  const role = (sessionUser?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401, error: 'Unauthorized' }
  
  if (role === 'ADMIN') return { ok: true as const, userId, weight: 100 }

  // Check if user has any voting power in the candidacy domain using the new CANDIDACY mode
  const weight = await calculateUserVotingWeight(userId, domainId, 'CANDIDACY', { targetWing })

  // Ensure weight is positive
  if (weight > 0) {
    return { ok: true as const, userId, weight }
  }

  return { ok: false as const, status: 403, error: 'Forbidden: No voting rights' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const candidacyId = typeof body.candidacyId === 'string' ? body.candidacyId.trim() : ''
    const score = typeof body.score === 'number' ? body.score : NaN

    if (!candidacyId || Number.isNaN(score) || !Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'candidacyId and score (-2..+2) are required' }, { status: 400 })
    }

    const candidacy = await prisma.expertCandidacy.findUnique({
      where: { id: candidacyId },
      include: {
        round: { select: { status: true, endDate: true } }
      }
    })

    if (!candidacy) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const roundStatus = candidacy.round?.status || ''
    // Check if round is active
    if (candidacy.status !== 'PENDING' || !['ACTIVE', 'MEMBERS_ACTIVE', 'HEAD_ACTIVE'].includes(roundStatus)) {
       return NextResponse.json({ error: 'Election round is closed or candidacy not pending' }, { status: 409 })
    }

    // Check permissions
    const perm = await canVoteOnCandidacy(session.user, candidacy.domainId, candidacy.wing)
    if (!perm.ok) {
      return NextResponse.json({ error: perm.error }, { status: perm.status as number })
    }

    const voterUserId = perm.userId
    const voterWeight = perm.weight || 0

    // Use transaction to update vote and total score
    await prisma.$transaction(async (tx) => {
      // 1. Get old vote to adjust score
      const existingVote = await tx.candidacyVote.findUnique({
        where: { 
          candidacyId_voterUserId: { 
            candidacyId, 
            voterUserId 
          } 
        }
      })
      
      const oldScore = existingVote?.score || 0
      const oldWeighted = oldScore * (voterWeight / 100)
      const newWeighted = score * (voterWeight / 100)
      const diff = newWeighted - oldWeighted

      await tx.candidacyVote.upsert({
        where: { candidacyId_voterUserId: { candidacyId, voterUserId } },
        update: { score },
        create: { candidacyId, voterUserId, score },
      })

      // 3. Update totalScore in candidacy
      await tx.expertCandidacy.update({
        where: { id: candidacyId },
        data: {
          totalScore: {
            increment: diff
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
