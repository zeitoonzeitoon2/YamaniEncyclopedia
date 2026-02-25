import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight, calculateVotingResult } from '@/lib/voting-utils'

const ALLOWED_VOTES = new Set(['APPROVE', 'REJECT'])

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : ''
    const vote = typeof body.vote === 'string' ? body.vote.trim() as 'APPROVE' | 'REJECT' : ''

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

    // Check if user has any voting power in the course domain (direct only)
    const weight = await calculateUserVotingWeight(session.user.id, chapter.course.domainId, 'DIRECT')

    if (weight === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.chapterVote.upsert({
      where: { chapterId_voterId: { chapterId, voterId: session.user.id } },
      update: { vote },
      create: { chapterId, voterId: session.user.id, vote },
    })

    // Get all votes
    const allVotes = await prisma.chapterVote.findMany({
      where: { chapterId }
    })

    // Calculate result using weights (direct only)
    const { approvals, rejections } = await calculateVotingResult(
      allVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' })),
      chapter.course.domainId,
      'DIRECT'
    )

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    const threshold = 50

    if (approvals > threshold) {
      nextStatus = 'APPROVED'
    } else if (rejections > threshold) {
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

      // Also approve all questions associated with this chapter
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

      // Also reject all questions associated with this chapter
      await prisma.chapterQuestion.updateMany({
        where: { chapterId },
        data: { status: 'REJECTED' }
      })
    }

    return NextResponse.json({ success: true, status: nextStatus, counts: { approvals, rejections, threshold } })
  } catch (error) {
    console.error('Error voting chapter:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
