import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is expert in this domain or admin
    const isExpert = await prisma.domainExpert.findUnique({
      where: {
        userId_domainId: {
          userId: session.user.id,
          domainId: params.id
        }
      }
    })

    const isAdmin = session.user.role === 'ADMIN'

    if (!isExpert && !isAdmin) {
      return NextResponse.json({ error: 'Only supervisors can vote on research prerequisites' }, { status: 403 })
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

    // Check if it should be approved
    // For now, let's say if it gets 2 votes or if it's from an admin it gets approved
    // This logic can be refined later based on requirements
    const votesCount = await prisma.domainPrerequisiteVote.count({
      where: { prerequisiteId, vote: 'APPROVE' }
    })

    if (votesCount >= 2 || isAdmin) {
      await prisma.domainPrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: 'APPROVED' }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting on research prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
