import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_VOTES = new Set(['APPROVE', 'REJECT'])

async function canVoteOnCandidacy(sessionUser: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (sessionUser?.id || '').trim()
  const role = (sessionUser?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN') return { ok: true as const, userId }

  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { parentId: true } })
  if (!domain) return { ok: false as const, status: 404 as const, error: 'Domain not found' }
  if (!domain.parentId) return { ok: false as const, status: 403 as const, error: 'Forbidden' }

  const membership = await prisma.domainExpert.findFirst({
    where: { userId, domainId: domain.parentId, role: { in: ['HEAD', 'EXPERT'] } },
    select: { id: true },
  })
  return membership ? { ok: true as const, userId } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const candidacyId = typeof body.candidacyId === 'string' ? body.candidacyId.trim() : ''
    const vote = typeof body.vote === 'string' ? body.vote.trim() : ''

    if (!candidacyId || !vote) {
      return NextResponse.json({ error: 'candidacyId and vote are required' }, { status: 400 })
    }
    if (!ALLOWED_VOTES.has(vote)) {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
    }

    const candidacy = await prisma.expertCandidacy.findUnique({
      where: { id: candidacyId },
      select: {
        id: true,
        domainId: true,
        candidateUserId: true,
        role: true,
        status: true,
        domain: { select: { parentId: true } },
      },
    })
    if (!candidacy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (candidacy.status !== 'PENDING') {
      return NextResponse.json({ error: 'Candidacy is closed' }, { status: 409 })
    }

    const perm = await canVoteOnCandidacy(session?.user, candidacy.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const voterUserId = perm.userId

    await prisma.candidacyVote.upsert({
      where: { candidacyId_voterUserId: { candidacyId, voterUserId } },
      update: { vote },
      create: { candidacyId, voterUserId, vote },
    })

    const [approvals, rejections, parentExpertsCount] = await Promise.all([
      prisma.candidacyVote.count({ where: { candidacyId, vote: 'APPROVE' } }),
      prisma.candidacyVote.count({ where: { candidacyId, vote: 'REJECT' } }),
      candidacy.domain.parentId
        ? prisma.domainExpert.count({ where: { domainId: candidacy.domain.parentId, role: { in: ['HEAD', 'EXPERT'] } } })
        : Promise.resolve(0),
    ])

    const shouldFinalize = approvals >= 2 || parentExpertsCount < 3
    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    if (approvals > rejections && shouldFinalize) nextStatus = 'APPROVED'
    if (rejections > approvals && shouldFinalize) nextStatus = 'REJECTED'

    if (nextStatus === 'APPROVED') {
      await prisma.$transaction([
        prisma.domainExpert.upsert({
          where: { userId_domainId: { userId: candidacy.candidateUserId, domainId: candidacy.domainId } },
          update: { role: candidacy.role },
          create: { userId: candidacy.candidateUserId, domainId: candidacy.domainId, role: candidacy.role },
          select: { id: true },
        }),
        prisma.expertCandidacy.update({
          where: { id: candidacyId },
          data: { status: 'APPROVED' },
          select: { id: true },
        }),
      ])
    } else if (nextStatus === 'REJECTED') {
      await prisma.expertCandidacy.update({
        where: { id: candidacyId },
        data: { status: 'REJECTED' },
        select: { id: true },
      })
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      counts: { approvals, rejections, parentExpertsCount },
    })
  } catch (error) {
    console.error('Error voting candidacy:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
