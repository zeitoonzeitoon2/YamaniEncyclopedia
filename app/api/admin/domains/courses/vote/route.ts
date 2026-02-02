import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_VOTES = new Set(['APPROVE', 'REJECT'])

async function canVoteOnCourse(user: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (user?.id || '').trim()
  const role = (user?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN') return { ok: true as const, userId }

  const membership = await prisma.domainExpert.findFirst({
    where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    select: { id: true },
  })

  return membership ? { ok: true as const, userId } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : ''
    const vote = typeof body.vote === 'string' ? body.vote.trim() : ''

    if (!courseId || !vote) {
      return NextResponse.json({ error: 'courseId and vote are required' }, { status: 400 })
    }
    if (!ALLOWED_VOTES.has(vote)) {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, domainId: true, status: true },
    })
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.status !== 'PENDING') {
      return NextResponse.json({ error: 'Course proposal is closed' }, { status: 409 })
    }

    const perm = await canVoteOnCourse(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    await prisma.courseVote.upsert({
      where: { courseId_voterId: { courseId, voterId: perm.userId } },
      update: { vote },
      create: { courseId, voterId: perm.userId, vote },
    })

    const [approvals, rejections, totalExperts] = await Promise.all([
      prisma.courseVote.count({ where: { courseId, vote: 'APPROVE' } }),
      prisma.courseVote.count({ where: { courseId, vote: 'REJECT' } }),
      prisma.domainExpert.count({ where: { domainId: course.domainId, role: { in: ['HEAD', 'EXPERT'] } } }),
    ])

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    const approvalThreshold = totalExperts <= 2 ? 1 : Math.floor(totalExperts / 2) + 1
    const rejectionThreshold = totalExperts <= 2 ? 1 : Math.floor(totalExperts / 2) + 1

    if (approvals >= approvalThreshold && approvals > rejections) {
      nextStatus = 'APPROVED'
    } else if (rejections >= rejectionThreshold && rejections > approvals) {
      nextStatus = 'REJECTED'
    }

    console.log(`Course ${courseId} vote result:`, { approvals, rejections, totalExperts, nextStatus })

    if (nextStatus !== 'PENDING') {
      await prisma.course.update({
        where: { id: courseId },
        data: { status: nextStatus, isActive: nextStatus === 'APPROVED' },
        select: { id: true },
      })
    }

    return NextResponse.json({ success: true, status: nextStatus, counts: { approvals, rejections, totalExperts } })
  } catch (error) {
    console.error('Error voting course:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
