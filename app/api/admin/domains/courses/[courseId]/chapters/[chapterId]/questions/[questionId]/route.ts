import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string; questionId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { questionId } = params
    const body = await request.json()
    const { status, question, options } = body

    const existingQuestion = await prisma.chapterQuestion.findUnique({
      where: { id: questionId },
      include: { chapter: { include: { course: true } } },
    })

    if (!existingQuestion) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const userId = session.user.id
    const domainId = existingQuestion.chapter.course.domainId

    // Check if user is an expert in the domain
    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    })

    if (session.user.role !== 'ADMIN' && !membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updatedQuestion = await prisma.chapterQuestion.update({
      where: { id: questionId },
      data: {
        ...(status ? { status } : {}),
        ...(question ? { question } : {}),
        ...(options ? {
          options: {
            deleteMany: {},
            create: options.map((opt: any) => ({
              text: opt.text,
              isCorrect: opt.isCorrect || false,
            })),
          },
        } : {}),
      },
      include: {
        options: true,
        author: { select: { id: true, name: true, email: true } },
        votes: { select: { voterId: true, score: true } },
      },
    })

    return NextResponse.json({ question: updatedQuestion })
  } catch (error) {
    console.error('Error updating chapter question:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string; questionId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { questionId } = params

    const existingQuestion = await prisma.chapterQuestion.findUnique({
      where: { id: questionId },
      include: { chapter: { include: { course: true } } },
    })

    if (!existingQuestion) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const userId = session.user.id
    const domainId = existingQuestion.chapter.course.domainId

    // Check if user is an expert in the domain or the author
    const membership = await prisma.domainExpert.findFirst({
      where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    })

    const isAuthor = existingQuestion.authorId === userId

    if (session.user.role !== 'ADMIN' && !membership && !isAuthor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.chapterQuestion.delete({
      where: { id: questionId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chapter question:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
