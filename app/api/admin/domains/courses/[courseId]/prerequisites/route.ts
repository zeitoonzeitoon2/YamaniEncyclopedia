import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { causesCircularDependency } from '@/lib/course-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prerequisites = await prisma.coursePrerequisite.findMany({
      where: { courseId: params.courseId },
      include: {
        prerequisiteCourse: {
          select: { id: true, title: true }
        },
        proposer: {
          select: { name: true }
        },
        _count: {
          select: { votes: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const domainPrerequisites = await prisma.domainPrerequisite.findMany({
      where: { courseId: params.courseId },
      include: {
        domain: {
          select: { id: true, name: true, slug: true }
        },
        proposer: {
          select: { name: true }
        },
        _count: {
          select: { votes: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Find courses that depend on this course (reverse prerequisites)
    const dependents = await prisma.coursePrerequisite.findMany({
      where: { 
        prerequisiteCourseId: params.courseId,
        status: 'APPROVED' // Only show approved ones as dependencies
      },
      include: {
        course: {
          select: { id: true, title: true }
        },
        proposer: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ prerequisites, domainPrerequisites, dependents })
  } catch (error) {
    console.error('Error fetching prerequisites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prerequisiteCourseId, type = 'STUDY' } = await request.json()
    if (!prerequisiteCourseId) {
      return NextResponse.json({ error: 'Prerequisite course ID is required' }, { status: 400 })
    }

    // Check if it's already a prerequisite with the same type
    const existing = await prisma.coursePrerequisite.findUnique({
      where: {
        courseId_prerequisiteCourseId_type: {
          courseId: params.courseId,
          prerequisiteCourseId,
          type
        }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'This prerequisite of this type is already proposed or approved' }, { status: 400 })
    }

    // Check for circular dependency
    const isCircular = await causesCircularDependency(params.courseId, prerequisiteCourseId)
    if (isCircular) {
      return NextResponse.json({ error: 'This would create a circular dependency' }, { status: 400 })
    }

    const prerequisite = await prisma.coursePrerequisite.create({
      data: {
        courseId: params.courseId,
        prerequisiteCourseId,
        type,
        proposerId: session.user.id,
        status: 'PENDING'
      }
    })

    return NextResponse.json({ prerequisite })
  } catch (error) {
    console.error('Error proposing prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
