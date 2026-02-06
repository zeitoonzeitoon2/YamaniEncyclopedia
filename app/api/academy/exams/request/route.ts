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

    let courseId
    try {
      const body = await req.json()
      courseId = body.courseId
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
    }

    // Check enrollment
    console.log(`[ExamRequest] Checking enrollment for userId: ${session.user.id}, courseId: ${courseId}`)
    let enrollment
    try {
      enrollment = await prisma.userCourse.findUnique({
        where: { userId_courseId: { userId: session.user.id, courseId } }
      })
    } catch (e) {
      console.error('[ExamRequest] Error fetching enrollment:', e)
      throw new Error(`Enrollment check failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
    }

    // Check if all chapters are completed
    console.log(`[ExamRequest] Fetching approved chapters for courseId: ${courseId}`)
    let approvedChapters
    try {
      approvedChapters = await prisma.courseChapter.findMany({
        where: { courseId, status: 'APPROVED' },
        select: { id: true, originalChapterId: true, version: true }
      })
    } catch (e) {
      console.error('[ExamRequest] Error fetching approved chapters:', e)
      throw new Error(`Chapters fetch failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }

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
    console.log(`[ExamRequest] Unique chapters required: ${uniqueChapterCount}`)
    
    // Get all progress for this user in this course's chapters
    console.log(`[ExamRequest] Fetching user progress for userId: ${session.user.id}`)
    let userProgress
    try {
      userProgress = await prisma.courseChapterProgress.findMany({
        where: { 
          userId: session.user.id, 
          chapterId: { in: approvedChapters.map(ch => ch.id) }
        },
        select: { 
          chapterId: true,
          chapter: { select: { originalChapterId: true } }
        }
      })
    } catch (e) {
      console.error('[ExamRequest] Error fetching user progress:', e)
      throw new Error(`Progress fetch failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }

    // Count how many unique root chapters the user has completed
    const completedRootIds = new Set<string>()
    for (const p of userProgress) {
      const rootId = p.chapter?.originalChapterId || p.chapterId
      if (rootChapterIds.has(rootId)) {
        completedRootIds.add(rootId)
      }
    }
    console.log(`[ExamRequest] Completed root chapters: ${completedRootIds.size}`)

    if (completedRootIds.size < uniqueChapterCount) {
      console.log(`[ExamRequest] Validation failed: completed=${completedRootIds.size}, required=${uniqueChapterCount}`)
      return NextResponse.json({ 
        error: 'Complete all chapters before requesting an exam',
        details: { completed: completedRootIds.size, total: uniqueChapterCount }
      }, { status: 400 })
    }

    // Check if there is already a pending or scheduled exam
    console.log(`[ExamRequest] Checking for existing exam requests`)
    let existingExam
    try {
      existingExam = await prisma.examSession.findFirst({
        where: {
          courseId,
          studentId: session.user.id,
          status: { in: ['REQUESTED', 'SCHEDULED'] }
        }
      })
    } catch (e) {
      console.error('[ExamRequest] Error checking existing exam:', e)
      throw new Error(`Existing exam check failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }

    if (existingExam) {
      return NextResponse.json({ error: 'An exam request is already pending or scheduled' }, { status: 400 })
    }

    console.log(`[ExamRequest] Creating new exam request`)
    let examRequest
    try {
      examRequest = await prisma.examSession.create({
        data: {
          courseId,
          studentId: session.user.id,
          status: 'REQUESTED'
        }
      })
    } catch (e) {
      console.error('[ExamRequest] Error creating exam request:', e)
      throw new Error(`Exam request creation failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }

    return NextResponse.json({ success: true, examRequest })
  } catch (error) {
    console.error('Error requesting exam:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
