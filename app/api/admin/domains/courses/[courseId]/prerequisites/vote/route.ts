import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { causesCircularDependency } from '@/lib/course-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is EXPERT or ADMIN
    if (session.user.role !== 'ADMIN' && session.user.role !== 'EXPERT') {
      return NextResponse.json({ error: 'Only admins and experts can vote' }, { status: 403 })
    }

    const { prerequisiteId, vote } = await request.json()
    if (!prerequisiteId || !['APPROVE', 'REJECT'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid vote data' }, { status: 400 })
    }

    const prerequisite = await prisma.coursePrerequisite.findUnique({
      where: { id: prerequisiteId },
      include: { votes: true }
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

    // Recalculate status
    const allVotes = await prisma.prerequisiteVote.findMany({
      where: { prerequisiteId }
    })

    const totalExperts = await prisma.user.count({
      where: { role: 'EXPERT' }
    })

    const approvals = allVotes.filter(v => v.vote === 'APPROVE').length
    const rejections = allVotes.filter(v => v.vote === 'REJECT').length

    // Threshold logic: same as courses/chapters
    // At least 1 approval if total experts <= 2, otherwise floor(experts/2) + 1
    const approvalThreshold = totalExperts <= 2 ? 1 : Math.floor(totalExperts / 2) + 1

    let nextStatus = 'PENDING'
    if (approvals >= approvalThreshold && approvals > rejections) {
      // Re-check for circular dependency before approving
      const isCircular = await causesCircularDependency(prerequisite.courseId, prerequisite.prerequisiteCourseId)
      if (isCircular) {
        nextStatus = 'REJECTED' // Reject if it would create a cycle
      } else {
        nextStatus = 'APPROVED'
      }
    } else if (rejections >= approvalThreshold && rejections >= approvals) {
      nextStatus = 'REJECTED'
    }

    if (nextStatus !== 'PENDING') {
      await prisma.coursePrerequisite.update({
        where: { id: prerequisiteId },
        data: { status: nextStatus }
      })
    }

    return NextResponse.json({ status: nextStatus })
  } catch (error) {
    console.error('Error voting on prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
