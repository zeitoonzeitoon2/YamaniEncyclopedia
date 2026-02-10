import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function canManageDomainCourses(user: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (user?.id || '').trim()
  const role = (user?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN' || role === 'SUPERVISOR') return { ok: true as const }

  // Check if user is an expert in this domain OR any of its ancestors
  // For now, check this domain first
  const membership = await prisma.domainExpert.findFirst({
    where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    select: { id: true },
  })
  if (membership) return { ok: true as const }

  // Check recursively for parent domains
  let currentDomainId = domainId
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
    if (parentMembership) return { ok: true as const }
    currentDomainId = domain.parentId
  }

  return { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 })

    const userId = session.user.id
    const role = session.user.role

    // For GET (viewing), be more lenient: allow if ADMIN, SUPERVISOR, or expert in ANY domain
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

    const courses = await prisma.course.findMany({
      where: { domainId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        syllabus: true,
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
      syllabus: c.syllabus,
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
    const rawSyllabus = Array.isArray(body.syllabus) ? body.syllabus : []
    const syllabus = rawSyllabus.reduce<Array<{ title: string; description?: string }>>((acc, item) => {
      const titleValue = typeof item?.title === 'string' ? item.title.trim() : ''
      const descValue = typeof item?.description === 'string' ? item.description.trim() : ''
      if (!titleValue) return acc
      if (descValue) {
        acc.push({ title: titleValue, description: descValue })
      } else {
        acc.push({ title: titleValue })
      }
      return acc
    }, [])

    if (!domainId || !title) {
      return NextResponse.json({ error: 'domainId and title are required' }, { status: 400 })
    }
    if (syllabus.length === 0) {
      return NextResponse.json({ error: 'syllabus is required' }, { status: 400 })
    }

    const perm = await canManageDomainCourses(session.user, domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } })
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

    const course = await prisma.course.create({
      data: { title, description, syllabus, domainId, proposerId: session.user.id, status: 'PENDING' },
      select: { id: true },
    })

    return NextResponse.json({ success: true, course })
  } catch (error) {
    console.error('Error creating course proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
