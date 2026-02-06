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
    const chapters = await prisma.courseChapter.findMany({
      where: { courseId, status: 'APPROVED' },
      select: { id: true }
    })

    const progress = await prisma.courseChapterProgress.findMany({
      where: { userId: session.user.id, chapterId: { in: chapters.map(c => c.id) } },
      select: { chapterId: true }
    })

    if (progress.length < chapters.length) {
      return NextResponse.json({ error: 'Complete all chapters before requesting an exam' }, { status: 400 })
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
