import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateUserVotingWeight, checkScoreApproval } from '@/lib/voting-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const domainId = params.id

    const weight = await calculateUserVotingWeight(session.user.id, domainId, 'DIRECT')
    if (weight === 0) {
      return NextResponse.json({ error: 'Only experts can vote on research prerequisites' }, { status: 403 })
    }

    const { prerequisiteId, score = 0 } = await request.json()
    if (!prerequisiteId) {
      return NextResponse.json({ error: 'Prerequisite ID is required' }, { status: 400 })
    }
    if (typeof score !== 'number' || !Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
    }

    await prisma.domainPrerequisiteVote.upsert({
      where: {
        prerequisiteId_voterId: {
          prerequisiteId,
          voterId: session.user.id
        }
      },
      update: { score },
      create: {
        prerequisiteId,
        voterId: session.user.id,
        score
      }
    })

    const allVotes = await prisma.domainPrerequisiteVote.findMany({ where: { prerequisiteId } })
    const result = await checkScoreApproval(
      domainId,
      allVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    if (result.approved) {
      await prisma.domainPrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: 'APPROVED' }
      })
    } else if (result.rejected) {
      await prisma.domainPrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: 'REJECTED' }
      })
    }

    return NextResponse.json({
      success: true,
      status: result.approved ? 'APPROVED' : result.rejected ? 'REJECTED' : 'PENDING',
      result
    })
  } catch (error) {
    console.error('Error voting on research prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
