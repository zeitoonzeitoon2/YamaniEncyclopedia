import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Helper function to check for circular dependencies
async function causesCircularDependency(courseId: string, prerequisiteCourseId: string): Promise<boolean> {
  // If the course is its own prerequisite, that's a cycle
  if (courseId === prerequisiteCourseId) return true

  const visited = new Set<string>()
  const queue = [prerequisiteCourseId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (currentId === courseId) return true
    
    if (visited.has(currentId)) continue
    visited.add(currentId)

    // Find all approved prerequisites of the current course
    const prerequisites = await prisma.coursePrerequisite.findMany({
      where: {
        courseId: currentId,
        status: 'APPROVED'
      },
      select: { prerequisiteCourseId: true }
    })

    for (const p of prerequisites) {
      queue.push(p.prerequisiteCourseId)
    }
  }

  return false
}

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

    return NextResponse.json({ prerequisites })
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

    const { prerequisiteCourseId } = await request.json()
    if (!prerequisiteCourseId) {
      return NextResponse.json({ error: 'Prerequisite course ID is required' }, { status: 400 })
    }

    // Check if it's already a prerequisite
    const existing = await prisma.coursePrerequisite.findUnique({
      where: {
        courseId_prerequisiteCourseId: {
          courseId: params.courseId,
          prerequisiteCourseId
        }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'This prerequisite is already proposed or approved' }, { status: 400 })
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
