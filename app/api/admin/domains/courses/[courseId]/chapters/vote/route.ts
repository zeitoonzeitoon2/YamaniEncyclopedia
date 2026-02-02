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

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : ''
    const vote = typeof body.vote === 'string' ? body.vote.trim() : ''

    if (!chapterId || !vote) {
      return NextResponse.json({ error: 'chapterId and vote are required' }, { status: 400 })
    }
    if (!ALLOWED_VOTES.has(vote)) {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
    }

    const chapter = await prisma.courseChapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        courseId: true,
        status: true,
        originalChapterId: true,
        course: { select: { domainId: true } },
      },
    })
    if (!chapter || chapter.courseId !== courseId) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }
    if (chapter.status !== 'PENDING') {
      return NextResponse.json({ error: 'Chapter draft is closed' }, { status: 409 })
    }

    const perm = await canVoteOnCourse(session.user, chapter.course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    await prisma.chapterVote.upsert({
      where: { chapterId_voterId: { chapterId, voterId: perm.userId } },
      update: { vote },
      create: { chapterId, voterId: perm.userId, vote },
    })

    const [approvals, rejections, totalExperts] = await Promise.all([
      prisma.chapterVote.count({ where: { chapterId, vote: 'APPROVE' } }),
      prisma.chapterVote.count({ where: { chapterId, vote: 'REJECT' } }),
      prisma.domainExpert.count({ where: { domainId: chapter.course.domainId, role: { in: ['HEAD', 'EXPERT'] } } }),
    ])

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    const approvalThreshold = totalExperts <= 2 ? 1 : Math.floor(totalExperts / 2) + 1
    const rejectionThreshold = totalExperts <= 2 ? 1 : Math.floor(totalExperts / 2) + 1

    if (approvals >= approvalThreshold && approvals > rejections) {
      nextStatus = 'APPROVED'
    } else if (rejections >= rejectionThreshold && rejections > approvals) {
      nextStatus = 'REJECTED'
    }

    if (nextStatus === 'APPROVED') {
      const rootId = chapter.originalChapterId || chapter.id
      const latest = await prisma.courseChapter.findFirst({
        where: {
          OR: [{ id: rootId }, { originalChapterId: rootId }],
          version: { not: null },
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version || 0) + 1

      await prisma.courseChapter.update({
        where: { id: chapterId },
        data: { status: 'APPROVED', version: nextVersion },
        select: { id: true },
      })
    } else if (nextStatus === 'REJECTED') {
      await prisma.courseChapter.update({
        where: { id: chapterId },
        data: { status: 'REJECTED' },
        select: { id: true },
      })
    }

    return NextResponse.json({ success: true, status: nextStatus, counts: { approvals, rejections, totalExperts } })
  } catch (error) {
    console.error('Error voting chapter:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
