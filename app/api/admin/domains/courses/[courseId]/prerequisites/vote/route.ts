import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { causesCircularDependency } from '@/lib/course-utils'
import { calculateUserVotingWeight, checkScoreApproval } from '@/lib/voting-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const course = await prisma.course.findUnique({
      where: { id: params.courseId },
      select: { domainId: true }
    })

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const weight = await calculateUserVotingWeight(session.user.id, course.domainId, 'DIRECT')
    if (weight === 0) {
      return NextResponse.json({ error: 'Only experts with voting power can vote' }, { status: 403 })
    }

    const { prerequisiteId, score } = await request.json()
    if (!prerequisiteId || typeof score !== 'number' || !Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Invalid vote data: prerequisiteId and score (-2..+2) required' }, { status: 400 })
    }

    const prerequisite = await prisma.coursePrerequisite.findUnique({
      where: { id: prerequisiteId }
    })

    if (!prerequisite) {
      return NextResponse.json({ error: 'Prerequisite not found' }, { status: 404 })
    }

    if (prerequisite.status !== 'PENDING') {
      return NextResponse.json({ error: 'This prerequisite is no longer pending' }, { status: 400 })
    }

    await prisma.prerequisiteVote.upsert({
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

    const allVotes = await prisma.prerequisiteVote.findMany({ where: { prerequisiteId } })
    const result = await checkScoreApproval(
      course.domainId,
      allVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    let nextStatus = 'PENDING'
    if (result.approved) {
      const isCircular = await causesCircularDependency(prerequisite.courseId, prerequisite.prerequisiteCourseId)
      nextStatus = isCircular ? 'REJECTED' : 'APPROVED'
    } else if (result.rejected) {
      nextStatus = 'REJECTED'
    }

    if (nextStatus !== 'PENDING') {
      await prisma.coursePrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: nextStatus }
      })
    }

    return NextResponse.json({ status: nextStatus, result })
  } catch (error) {
    console.error('Error voting on prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
