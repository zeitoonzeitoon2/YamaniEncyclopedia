import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getInternalVotingMetrics, rejectExpiredProposals } from '@/lib/voting-utils'
import { Prisma } from '@prisma/client'

async function canManageDomainCourses(user: { id?: string; role?: string } | undefined, domainId: string) {
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

export async function GET(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, description: true, domainId: true },
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    await rejectExpiredProposals()

    const chapters = await prisma.courseChapter.findMany({
      where: { courseId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        content: true,
        orderIndex: true,
        status: true,
        version: true,
        originalChapterId: true,
        changeReason: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true, email: true, role: true } },
        votes: { select: { voterId: true, score: true } },
      },
    })

    const enriched = await Promise.all(chapters.map(async (c) => {
      const votes = c.votes.map(v => ({ voterId: v.voterId, score: v.score }))
      const voting = await getInternalVotingMetrics(course.domainId, votes)
      return { ...c, voting }
    }))

    return NextResponse.json({ course, chapters: enriched })
  } catch (error) {
    console.error('Error fetching course chapters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const content = typeof body.content === 'string' ? body.content : ''
    const orderIndex = typeof body.orderIndex === 'number' ? body.orderIndex : 0
    const originalChapterId = typeof body.originalChapterId === 'string' ? body.originalChapterId.trim() : ''
    const changeReason = body.changeReason

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, domainId: true },
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    let originalId: string | null = null
    if (originalChapterId) {
      const original = await prisma.courseChapter.findUnique({
        where: { id: originalChapterId },
        select: { id: true, courseId: true },
      })
      if (!original || original.courseId !== courseId) {
        return NextResponse.json({ error: 'Original chapter not found' }, { status: 404 })
      }
      originalId = original.id
    }

    // Reuse existing PENDING draft for the same root chapter by the same author
    if (originalId) {
      const existingDraft = await prisma.courseChapter.findFirst({
        where: {
          originalChapterId: originalId,
          authorId: perm.userId,
          status: 'PENDING',
        },
        select: { id: true },
      })

      if (existingDraft) {
        await prisma.courseChapter.update({
          where: { id: existingDraft.id },
          data: {
            title,
            content,
            orderIndex,
            ...(changeReason ? { changeReason: (changeReason as any) as Prisma.InputJsonValue } : {}),
            ...(submittedForVote ? { submittedForVote: true } : {}),
          },
        })
        return NextResponse.json({ chapter: existingDraft }, { status: 200 })
      }
    }

    const chapter = await prisma.courseChapter.create({
      data: {
        title,
        content,
        orderIndex,
        status: 'PENDING',
        courseId,
        authorId: perm.userId,
        originalChapterId: originalId,
        ...(changeReason ? { changeReason: (changeReason as any) as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    })

    // Copy questions from the latest APPROVED version (not just the root)
    if (originalId) {
      const latestApproved = await prisma.courseChapter.findFirst({
        where: {
          OR: [{ id: originalId }, { originalChapterId: originalId }],
          status: 'APPROVED',
        },
        orderBy: { version: 'desc' },
        select: { id: true },
      })
      const sourceChapterId = latestApproved?.id || originalId

      const originalQuestions = await prisma.chapterQuestion.findMany({
        where: { chapterId: sourceChapterId, status: 'APPROVED' },
        include: { options: true }
      })

      if (originalQuestions.length > 0) {
        await prisma.$transaction(
          originalQuestions.map(q => prisma.chapterQuestion.create({
            data: {
              chapterId: chapter.id,
              question: q.question,
              authorId: perm.userId,
              status: 'PENDING',
              options: {
                create: q.options.map(opt => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect
                }))
              }
            }
          }))
        )
      }
    }

    return NextResponse.json({ chapter }, { status: 201 })
  } catch (error) {
    console.error('Error creating chapter draft:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { courseId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const order = Array.isArray(body.order) ? body.order : []
    if (!order.length) {
      return NextResponse.json({ error: 'order is required' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, domainId: true },
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const normalized = order
      .map((item: any) => ({
        id: typeof item?.id === 'string' ? item.id.trim() : '',
        orderIndex: typeof item?.orderIndex === 'number' ? item.orderIndex : null,
      }))
      .filter((item: any) => item.id && item.orderIndex !== null)

    if (!normalized.length) {
      return NextResponse.json({ error: 'Invalid order data' }, { status: 400 })
    }

    const ids = normalized.map((n: any) => n.id)
    const existing = await prisma.courseChapter.findMany({
      where: { id: { in: ids }, courseId },
      select: { id: true },
    })
    if (existing.length !== ids.length) {
      return NextResponse.json({ error: 'Invalid chapter selection' }, { status: 400 })
    }

    await prisma.$transaction(
      normalized.map((item: any) =>
        prisma.courseChapter.update({
          where: { id: item.id },
          data: { orderIndex: item.orderIndex },
          select: { id: true },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reordering chapters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
