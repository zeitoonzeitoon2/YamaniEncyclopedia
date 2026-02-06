import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const courseId = (params.id || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        isActive: true,
        domain: { select: { id: true, name: true, slug: true } },
      },
    })
    if (!course || course.status !== 'APPROVED' || !course.isActive) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const approved = await prisma.courseChapter.findMany({
      where: { courseId, status: 'APPROVED' },
      select: {
        id: true,
        title: true,
        content: true,
        orderIndex: true,
        version: true,
        originalChapterId: true,
      },
    })

    const byRoot = new Map<string, typeof approved[number]>()
    for (const ch of approved) {
      const rootId = ch.originalChapterId || ch.id
      const current = byRoot.get(rootId)
      const currentVersion = current?.version ?? 0
      const nextVersion = ch.version ?? 0
      if (!current || nextVersion >= currentVersion) {
        byRoot.set(rootId, ch)
      }
    }

    const chapters = Array.from(byRoot.values()).sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      return (b.version ?? 0) - (a.version ?? 0)
    })

    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    let enrollment: { status: string } | null = null
    let progress: string[] = []

    if (userId) {
      try {
        const [enrolled, completed, lastExam] = await Promise.all([
          prisma.userCourse.findFirst({
            where: { userId, courseId },
            select: { status: true },
          }),
          prisma.courseChapterProgress.findMany({
            where: { userId, chapter: { courseId } },
            select: { chapterId: true },
          }),
          prisma.examSession.findFirst({
            where: { studentId: userId, courseId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, scheduledAt: true, meetLink: true, score: true, feedback: true }
          })
        ])
        enrollment = enrolled ? { status: enrolled.status } : null
        progress = completed.map((c) => c.chapterId)
        return NextResponse.json({ course, chapters, enrollment, progress, lastExam })
      } catch (dbError) {
        console.error('[CourseAPI] Database error during authenticated fetch:', dbError)
        return NextResponse.json({ course, chapters, enrollment: null, progress: [] })
      }
    }

    return NextResponse.json({ course, chapters, enrollment, progress })
  } catch (error) {
    console.error('Error fetching course viewer:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
