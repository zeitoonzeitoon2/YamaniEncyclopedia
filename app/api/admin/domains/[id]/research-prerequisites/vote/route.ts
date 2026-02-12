import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateUserVotingWeight, calculateVotingResult } from '@/lib/voting-utils'

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

    // Check if user has any voting power in this domain (direct only)
    const weight = await calculateUserVotingWeight(session.user.id, domainId, 'DIRECT')
    const isAdmin = session.user.role === 'ADMIN'

    if (weight === 0 && !isAdmin) {
      return NextResponse.json({ error: 'Only experts can vote on research prerequisites' }, { status: 403 })
    }

    const { prerequisiteId, vote = 'APPROVE' } = await request.json()
    if (!prerequisiteId) {
      return NextResponse.json({ error: 'Prerequisite ID is required' }, { status: 400 })
    }

    // Upsert vote
    await prisma.domainPrerequisiteVote.upsert({
      where: {
        prerequisiteId_voterId: {
          prerequisiteId,
          voterId: session.user.id
        }
      },
      update: { vote },
      create: {
        prerequisiteId,
        voterId: session.user.id,
        vote
      }
    })

    // Get all votes for this prerequisite
    const allVotes = await prisma.domainPrerequisiteVote.findMany({
      where: { prerequisiteId }
    })

    // Calculate result using weights (direct only)
    const { approvals, rejections } = await calculateVotingResult(allVotes, domainId, 'DIRECT')

    const threshold = 50
    if (approvals > threshold || isAdmin) {
      await prisma.domainPrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: 'APPROVED' }
      })
    } else if (rejections >= threshold) {
      await prisma.domainPrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: 'REJECTED' }
      })
    }

    return NextResponse.json({ success: true, approvals, rejections, threshold })
  } catch (error) {
    console.error('Error voting on research prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
