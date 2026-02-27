import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string; questionId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { questionId } = params
    const body = await request.json()
    const { score } = body

    if (typeof score !== 'number' || !Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
    }

    const question = await prisma.chapterQuestion.findUnique({
      where: { id: questionId },
      include: { chapter: { include: { course: true } } },
    })

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const userId = session.user.id
    const domainId = question.chapter.course.domainId

    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.questionVote.upsert({
      where: {
        questionId_voterId: {
          questionId,
          voterId: userId,
        },
      },
      update: { score },
      create: {
        questionId,
        voterId: userId,
        score,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting on chapter question:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
