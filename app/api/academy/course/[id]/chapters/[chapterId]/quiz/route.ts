import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: courseId, chapterId } = params

    // Check if student is enrolled in the course
    const enrollment = await prisma.userCourse.findFirst({
      where: {
        userId: session.user.id,
        courseId: courseId,
      },
    })

    if (!enrollment && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'You are not enrolled in this course' }, { status: 403 })
    }

    const questions = await prisma.chapterQuestion.findMany({
      where: {
        chapterId,
        status: 'APPROVED',
      },
      select: {
        id: true,
        question: true,
        options: {
          select: {
            id: true,
            text: true,
            isCorrect: true, // We need this to check answers on client side as it's self-assessment
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Error fetching quiz:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
