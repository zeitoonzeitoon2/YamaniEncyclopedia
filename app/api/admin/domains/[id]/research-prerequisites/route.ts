import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prerequisites = await prisma.domainPrerequisite.findMany({
      where: { domainId: params.id },
      include: {
        course: {
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
    console.error('Error fetching research prerequisites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      return NextResponse.json({ error: 'Only supervisors can propose research prerequisites' }, { status: 403 })
    }

    const { courseId } = await request.json()
    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    // Check if it's already a prerequisite
    const existing = await prisma.domainPrerequisite.findUnique({
      where: {
        domainId_courseId: {
          domainId: params.id,
          courseId
        }
      }
    })

    if (existing) {
      return NextResponse.json({ error: 'This course is already proposed or approved as a research prerequisite' }, { status: 400 })
    }

    const prerequisite = await prisma.domainPrerequisite.create({
      data: {
        domainId: params.id,
        courseId,
        proposerId: session.user.id,
        status: 'PENDING'
      }
    })

    return NextResponse.json({ prerequisite })
  } catch (error) {
    console.error('Error proposing research prerequisite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
