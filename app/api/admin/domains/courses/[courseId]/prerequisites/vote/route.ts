import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { causesCircularDependency } from '@/lib/course-utils'
import { calculateUserVotingWeight, calculateVotingResult } from '@/lib/voting-utils'

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

    // Check if user has any voting power in the course domain (direct only)
    const weight = await calculateUserVotingWeight(session.user.id, course.domainId, 'DIRECT')

    if (weight === 0) {
      return NextResponse.json({ error: 'Only experts with voting power can vote' }, { status: 403 })
    }

    const { prerequisiteId, vote } = await request.json()
    if (!prerequisiteId || !['APPROVE', 'REJECT'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 })
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

    // Update or create vote
    await prisma.prerequisiteVote.upsert({
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

    // Get all votes
    const allVotes = await prisma.prerequisiteVote.findMany({
      where: { prerequisiteId }
    })

    // Calculate result using weights (direct only)
    const { approvals, rejections } = await calculateVotingResult(
      allVotes.map(v => ({ voterId: v.voterId, vote: v.vote })),
      course.domainId,
      'DIRECT'
    )

    const threshold = 50
    let nextStatus = 'PENDING'

    if (approvals > threshold) {
      // Re-check for circular dependency before approving
      const isCircular = await causesCircularDependency(prerequisite.courseId, prerequisite.prerequisiteCourseId)
      if (isCircular) {
        nextStatus = 'REJECTED' // Reject if it would create a cycle
      } else {
        nextStatus = 'APPROVED'
      }
    } else if (rejections > threshold) {
      nextStatus = 'REJECTED'
    }

    if (nextStatus !== 'PENDING') {
      await prisma.coursePrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: nextStatus }
      })
    }

    return NextResponse.json({ status: nextStatus, approvals, rejections, threshold })
  } catch (error) {
    console.error('Error voting on prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
