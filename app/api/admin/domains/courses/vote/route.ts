import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight, checkScoreApproval } from '@/lib/voting-utils'

async function canVoteOnCourse(user: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (user?.id || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }

  const weight = await calculateUserVotingWeight(userId, domainId, 'DIRECT')
  
  return weight > 0 ? { ok: true as const, userId } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : ''
    const score = typeof body.score === 'number' ? body.score : NaN

    if (!courseId || Number.isNaN(score)) {
      return NextResponse.json({ error: 'courseId and score are required' }, { status: 400 })
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, domainId: true, status: true, syllabus: true },
    })
    if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (course.status !== 'PENDING') {
      return NextResponse.json({ error: 'Course proposal is closed' }, { status: 409 })
    }

    const perm = await canVoteOnCourse(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    await prisma.courseVote.upsert({
      where: { courseId_voterId: { courseId, voterId: perm.userId } },
      update: { score },
      create: { courseId, voterId: perm.userId, score },
    })

    const allVotes = await prisma.courseVote.findMany({ where: { courseId } })
    const result = await checkScoreApproval(
      course.domainId,
      allVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    if (result.approved) nextStatus = 'APPROVED'
    else if (result.rejected) nextStatus = 'REJECTED'

    if (nextStatus !== 'PENDING') {
      if (nextStatus === 'APPROVED') {
        const existingChapters = await prisma.courseChapter.count({ where: { courseId } })
        const syllabusItems = Array.isArray(course.syllabus)
          ? course.syllabus.reduce<Array<{ title: string; description?: string }>>((acc, item) => {
              if (!item || typeof item !== 'object') return acc
              const record = item as Record<string, unknown>
              const title = typeof record.title === 'string' ? record.title.trim() : ''
              const description = typeof record.description === 'string' ? record.description.trim() : ''
              if (!title) return acc
              if (description) {
                acc.push({ title, description })
              } else {
                acc.push({ title })
              }
              return acc
            }, [])
          : []

        await prisma.$transaction([
          prisma.course.update({
            where: { id: courseId },
            data: { status: nextStatus, isActive: true },
            select: { id: true },
          }),
          ...(existingChapters === 0 && syllabusItems.length > 0
            ? [
                prisma.courseChapter.createMany({
                  data: syllabusItems.map((item, index) => ({
                    title: item.title,
                    content: '',
                    orderIndex: index,
                    status: 'APPROVED',
                    version: 1,
                    courseId,
                    authorId: perm.userId,
                  })),
                }),
              ]
            : []),
        ])
      } else {
        await prisma.course.update({
          where: { id: courseId },
          data: { status: nextStatus, isActive: false },
          select: { id: true },
        })
      }
    }

    return NextResponse.json({ success: true, status: nextStatus, result })
  } catch (error) {
    console.error('Error voting course:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
