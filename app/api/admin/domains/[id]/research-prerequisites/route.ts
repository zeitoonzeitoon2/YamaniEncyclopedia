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

    const userId = session.user.id
    const role = session.user.role

    // For GET (viewing), allow if ADMIN, SUPERVISOR, or expert in ANY domain
    let canView = role === 'ADMIN' || role === 'SUPERVISOR'
    if (!canView) {
      const anyMembership = await prisma.domainExpert.findFirst({
        where: { userId },
        select: { id: true }
      })
      if (anyMembership) canView = true
    }

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    // Check if user is expert in this domain (or ancestors) or admin/supervisor
    const userId = session.user.id
    const role = session.user.role
    const isAdmin = role === 'ADMIN'
    const isSupervisor = role === 'SUPERVISOR'

    let isAuthorized = isAdmin || isSupervisor

    if (!isAuthorized) {
      // Check if user is expert in this domain
      const isExpert = await prisma.domainExpert.findUnique({
        where: { userId_domainId: { userId, domainId: params.id } }
      })
      if (isExpert) isAuthorized = true
    }

    if (!isAuthorized) {
      // Check ancestors recursively
      let currentDomainId = params.id
      while (currentDomainId) {
        const domain = await prisma.domain.findUnique({
          where: { id: currentDomainId },
          select: { parentId: true }
        })
        if (!domain || !domain.parentId) break
        
        const parentMembership = await prisma.domainExpert.findFirst({
          where: { userId, domainId: domain.parentId, role: { in: ['HEAD', 'EXPERT'] } },
          select: { id: true },
        })
        if (parentMembership) {
          isAuthorized = true
          break
        }
        currentDomainId = domain.parentId
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Only domain experts or supervisors can propose research prerequisites' }, { status: 403 })
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
