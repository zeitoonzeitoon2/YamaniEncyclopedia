import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set(['HEAD', 'EXPERT'])

async function hasAnyDomainExpertMembership(userId: string) {
  const m = await prisma.domainExpert.findFirst({ where: { userId }, select: { id: true } })
  return !!m
}

async function canProposeCandidacy(userId: string, domainId: string, targetWing: string) {
  if (targetWing === 'RIGHT') {
    // Proposer must be an expert in the parent domain (either wing)
    const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { parentId: true } })
    if (!domain?.parentId) return { ok: false as const, status: 403 as const, error: 'No parent domain to appoint right wing' }

    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId: domain.parentId },
      select: { id: true }
    })
    if (membership) return { ok: true as const }
  } else {
    // targetWing === 'LEFT'
    // Proposer must be a RIGHT wing expert in any child domain
    const membership = await prisma.domainExpert.findFirst({
      where: { 
        userId, 
        wing: 'RIGHT',
        domain: { parentId: domainId }
      },
      select: { id: true }
    })
    if (membership) return { ok: true as const }
  }

  return { ok: false as const, status: 403 as const, error: 'You are not authorized to propose for this wing' }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (session?.user?.role || '').trim()

    if (role !== 'ADMIN' && role !== 'EXPERT') {
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
        wing: true,
        status: true,
        roundId: true,
        totalScore: true,
        createdAt: true,
        domain: { select: { name: true } },
        candidateUser: { select: { name: true, email: true } },
        proposerUser: { select: { name: true, email: true } },
        votes: { select: { voterUserId: true, vote: true, score: true } },
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
    const requestedWing = typeof body.wing === 'string' ? body.wing.trim() : ''
    const wingValue = requestedWing || 'RIGHT'

    if (!domainId || !candidateUserId) {
      return NextResponse.json({ error: 'domainId and candidateUserId are required' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.has(roleValue)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (!['RIGHT', 'LEFT'].includes(wingValue)) {
      return NextResponse.json({ error: 'Invalid wing' }, { status: 400 })
    }

    // Find active election round for this domain and wing
    const activeRound = await prisma.electionRound.findFirst({
      where: {
        domainId,
        wing: wingValue as 'RIGHT' | 'LEFT',
        status: 'ACTIVE'
      }
    })

    if (!activeRound) {
      return NextResponse.json({ error: 'No active election round for this wing' }, { status: 400 })
    }

    if (new Date() > activeRound.endDate) {
      return NextResponse.json({ error: 'Nomination period for this round has ended' }, { status: 400 })
    }

    if (role !== 'ADMIN') {
      const perm = await canProposeCandidacy(userId, domainId, wingValue)
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
      update: {
        proposerUserId: userId,
        status: 'PENDING',
        role: roleValue,
        wing: wingValue,
        roundId: activeRound.id,
        totalScore: 0
      },
      create: {
        domainId,
        candidateUserId,
        proposerUserId: userId,
        status: 'PENDING',
        role: roleValue,
        wing: wingValue,
        roundId: activeRound.id,
        totalScore: 0
      },
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        proposerUserId: true,
        role: true,
        wing: true,
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
