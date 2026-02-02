import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function canManageDomainCourses(user: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (user?.id || '').trim()
  const role = (user?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN') return { ok: true as const }

  const membership = await prisma.domainExpert.findFirst({
    where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    select: { id: true },
  })
  return membership ? { ok: true as const } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 })

    const perm = await canManageDomainCourses(session.user, domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const courses = await prisma.course.findMany({
      where: { domainId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        proposer: { select: { id: true, name: true, email: true, role: true } },
        votes: { select: { voterId: true, vote: true } },
      },
    })

    const payload = courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      createdAt: c.createdAt,
      proposerUser: c.proposer,
      votes: c.votes,
    }))

    return NextResponse.json({ courses: payload })
  } catch (error) {
    console.error('Error fetching courses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const domainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null

    if (!domainId || !title) {
      return NextResponse.json({ error: 'domainId and title are required' }, { status: 400 })
    }

    const perm = await canManageDomainCourses(session.user, domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } })
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

    const course = await prisma.course.create({
      data: { title, description, domainId, proposerId: session.user.id, status: 'PENDING' },
      select: { id: true },
    })

    return NextResponse.json({ success: true, course })
  } catch (error) {
    console.error('Error creating course proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
