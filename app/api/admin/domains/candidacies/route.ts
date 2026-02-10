import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set(['HEAD', 'EXPERT'])

async function hasAnyDomainExpertMembership(userId: string) {
  const m = await prisma.domainExpert.findFirst({ where: { userId }, select: { id: true } })
  return !!m
}

async function canManageChildDomainByParentExpert(userId: string, domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true, parentId: true } })
  if (!domain) return { ok: false as const, status: 404 as const, error: 'Domain not found' }

  // Check if user is an expert in any ancestor domain
  let currentParentId = domain.parentId
  while (currentParentId) {
    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId: currentParentId, role: { in: ['HEAD', 'EXPERT'] } },
      select: { id: true },
    })
    if (membership) return { ok: true as const, domain }

    const parentDomain = await prisma.domain.findUnique({
      where: { id: currentParentId },
      select: { parentId: true },
    })
    currentParentId = parentDomain?.parentId || null
  }

  return { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    if (role !== 'ADMIN' && role !== 'SUPERVISOR') {
      const ok = await hasAnyDomainExpertMembership(userId)
      if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domainId = (searchParams.get('domainId') || '').trim()
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 })

    const candidacies = await prisma.expertCandidacy.findMany({
      where: { domainId, status: 'PENDING' },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        proposerUserId: true,
        role: true,
        status: true,
        createdAt: true,
        candidateUser: { select: { id: true, name: true, email: true, role: true } },
        proposerUser: { select: { id: true, name: true, email: true, role: true } },
        votes: { select: { voterUserId: true, vote: true } },
      },
    })

    return NextResponse.json({ candidacies })
  } catch (error) {
    console.error('Error fetching candidacies:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const domainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''
    const candidateUserId = typeof body.candidateUserId === 'string' ? body.candidateUserId.trim() : ''
    const requestedRole = typeof body.role === 'string' ? body.role.trim() : ''
    const roleValue = requestedRole || 'EXPERT'

    if (!domainId || !candidateUserId) {
      return NextResponse.json({ error: 'domainId and candidateUserId are required' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.has(roleValue)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (role !== 'ADMIN') {
      const perm = await canManageChildDomainByParentExpert(userId, domainId)
      if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })
    } else {
      const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { parentId: true } })
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    const [candidate, existingExpert] = await Promise.all([
      prisma.user.findUnique({ where: { id: candidateUserId }, select: { id: true } }),
      prisma.domainExpert.findFirst({ where: { domainId, userId: candidateUserId }, select: { id: true } }),
    ])

    if (!candidate) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (existingExpert) return NextResponse.json({ error: 'User is already a domain expert' }, { status: 409 })

    const existingCandidacy = await prisma.expertCandidacy.findUnique({
      where: { domainId_candidateUserId: { domainId, candidateUserId } },
      select: { id: true, status: true },
    })
    if (existingCandidacy?.status === 'PENDING') {
      return NextResponse.json({ error: 'Candidacy already exists' }, { status: 409 })
    }

    const candidacy = await prisma.expertCandidacy.upsert({
      where: { domainId_candidateUserId: { domainId, candidateUserId } },
      update: { proposerUserId: userId, status: 'PENDING', role: roleValue },
      create: { domainId, candidateUserId, proposerUserId: userId, status: 'PENDING', role: roleValue },
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        proposerUserId: true,
        role: true,
        status: true,
        createdAt: true,
        candidateUser: { select: { id: true, name: true, email: true, role: true } },
        proposerUser: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    return NextResponse.json({ success: true, candidacy })
  } catch (error) {
    console.error('Error creating candidacy:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
