import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight, checkScoreApproval } from '@/lib/voting-utils'

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : ''
    const score = typeof body.score === 'number' ? body.score : NaN

    if (!chapterId || Number.isNaN(score)) {
      return NextResponse.json({ error: 'chapterId and score are required' }, { status: 400 })
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
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

    const weight = await calculateUserVotingWeight(session.user.id, chapter.course.domainId, 'DIRECT')
    if (weight === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.chapterVote.upsert({
      where: { chapterId_voterId: { chapterId, voterId: session.user.id } },
      update: { score },
      create: { chapterId, voterId: session.user.id, score },
    })

    const allVotes = await prisma.chapterVote.findMany({ where: { chapterId } })
    const result = await checkScoreApproval(
      chapter.course.domainId,
      allVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    if (result.approved) nextStatus = 'APPROVED'
    else if (result.rejected) nextStatus = 'REJECTED'

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

      await prisma.chapterQuestion.updateMany({
        where: { chapterId },
        data: { status: 'APPROVED' }
      })
    } else if (nextStatus === 'REJECTED') {
      await prisma.courseChapter.update({
        where: { id: chapterId },
        data: { status: 'REJECTED' },
        select: { id: true },
      })

      await prisma.chapterQuestion.updateMany({
        where: { chapterId },
        data: { status: 'REJECTED' }
      })
    }

    return NextResponse.json({ success: true, status: nextStatus, result })
  } catch (error) {
    console.error('Error voting chapter:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
