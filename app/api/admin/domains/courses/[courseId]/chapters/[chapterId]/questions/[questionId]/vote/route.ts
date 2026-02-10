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
    const { vote } = body // 'APPROVE' or 'REJECT'

    if (!['APPROVE', 'REJECT'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
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

    // Check if user is an expert in the domain
    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    })

    if (session.user.role !== 'ADMIN' && !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.questionVote.upsert({
      where: {
        questionId_voterId: {
          questionId,
          voterId: userId,
        },
      },
      update: { vote },
      create: {
        questionId,
        voterId: userId,
        vote,
      },
    })

    // Auto-approve logic if needed (optional)
    // For now, let's just record the vote.

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting on chapter question:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
