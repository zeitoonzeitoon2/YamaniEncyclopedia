import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.id || '').trim()
    if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 })

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : ''
    if (!chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 })

    const enrollment = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { userId: true },
    })
    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
    }

    const chapter = await prisma.courseChapter.findUnique({
      where: { id: chapterId },
      select: { id: true, courseId: true, status: true },
    })
    if (!chapter || chapter.courseId !== courseId || chapter.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }

    await prisma.courseChapterProgress.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: { completedAt: new Date() },
      create: { userId, chapterId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error marking chapter progress:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
