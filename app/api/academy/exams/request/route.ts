import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { courseId } = await req.json()
    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    // Check enrollment
    const enrollment = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId: session.user.id, courseId } }
    })

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
    }

    // Check if all chapters are completed
    const approvedChapters = await prisma.courseChapter.findMany({
      where: { courseId, status: 'APPROVED' },
      select: { id: true, originalChapterId: true, version: true }
    })

    // Group by root chapter to find unique chapters (latest versions)
    const rootChapterIds = new Set<string>()
    const byRoot = new Map<string, { id: string; version: number }>()
    
    for (const ch of approvedChapters) {
      const rootId = ch.originalChapterId || ch.id
      rootChapterIds.add(rootId)
      const current = byRoot.get(rootId)
      const nextVersion = ch.version ?? 0
      if (!current || nextVersion >= current.version) {
        byRoot.set(rootId, { id: ch.id, version: nextVersion })
      }
    }

    const uniqueChapterCount = byRoot.size
    
    // Get all progress for this user in this course's chapters
    const userProgress = await prisma.courseChapterProgress.findMany({
      where: { 
        userId: session.user.id, 
        chapter: { courseId } 
      },
      select: { 
        chapterId: true,
        chapter: { select: { originalChapterId: true } }
      }
    })

    // Count how many unique root chapters the user has completed
    const completedRootIds = new Set<string>()
    for (const p of userProgress) {
      // The chapter they completed might be an old version, so we find its root
      const rootId = p.chapter.originalChapterId || p.chapterId
      if (rootChapterIds.has(rootId)) {
        completedRootIds.add(rootId)
      }
    }

    if (completedRootIds.size < uniqueChapterCount) {
      console.log(`[ExamRequest] Validation failed: completed=${completedRootIds.size}, required=${uniqueChapterCount}`)
      return NextResponse.json({ 
        error: 'Complete all chapters before requesting an exam',
        details: { completed: completedRootIds.size, total: uniqueChapterCount }
      }, { status: 400 })
    }

    // Check if there is already a pending or scheduled exam
    const existingExam = await prisma.examSession.findFirst({
      where: {
        courseId,
        studentId: session.user.id,
        status: { in: ['REQUESTED', 'SCHEDULED'] }
      }
    })

    if (existingExam) {
      return NextResponse.json({ error: 'An exam request is already pending or scheduled' }, { status: 400 })
    }

    const examRequest = await prisma.examSession.create({
      data: {
        courseId,
        studentId: session.user.id,
        status: 'REQUESTED'
      }
    })

    return NextResponse.json({ success: true, examRequest })
  } catch (error) {
    console.error('Error requesting exam:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
