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

    const prerequisites = await prisma.coursePrerequisite.findMany({
      where: { courseId, status: 'APPROVED' },
      select: {
        prerequisiteCourse: {
          select: { id: true, title: true }
        }
      }
    })

    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    let enrollment: { status: string } | null = null
    let progress: string[] = []

    if (userId) {
      // Fetch each part separately with individual try-catches to be resilient to missing tables/columns
      try {
        const enrolled = await prisma.userCourse.findUnique({
          where: { userId_courseId: { userId, courseId } },
          select: { status: true },
        }).catch(err => {
          console.error('[CourseAPI] Error fetching enrollment:', err)
          return null
        })
        
        const completed = await prisma.courseChapterProgress.findMany({
          where: { userId, chapter: { courseId } },
          select: { chapterId: true },
        }).catch(err => {
          console.error('[CourseAPI] Error fetching progress:', err)
          return []
        })
        
        const lastExam = await prisma.examSession.findFirst({
          where: { studentId: userId, courseId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, scheduledAt: true, meetLink: true, score: true, feedback: true }
        }).catch(err => {
          console.error('[CourseAPI] Error fetching lastExam:', err)
          return null
        })
 
        return NextResponse.json({ 
          course, 
          chapters, 
          prerequisites,
          enrollment: enrolled ? { status: enrolled.status } : null, 
          progress: Array.isArray(completed) ? completed.map((c: any) => c.chapterId) : [], 
          lastExam 
        })
      } catch (globalDbError) {
        console.error('[CourseAPI] Global database error during authenticated fetch:', globalDbError)
        return NextResponse.json({ course, chapters, prerequisites, enrollment: null, progress: [] })
      }
    }

    return NextResponse.json({ course, chapters, prerequisites, enrollment, progress })
  } catch (error) {
    console.error('Error fetching course viewer:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
