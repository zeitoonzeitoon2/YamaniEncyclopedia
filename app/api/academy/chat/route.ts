import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const examSessionId = searchParams.get('examSessionId')

    if (!examSessionId) {
      return NextResponse.json({ error: 'Exam session ID is required' }, { status: 400 })
    }

    // Verify user is part of this session
    const examSession = await prisma.examSession.findUnique({
      where: { id: examSessionId },
      select: { studentId: true, examinerId: true }
    })

    if (!examSession) {
      return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })
    }

    if (examSession.studentId !== session.user.id && examSession.examinerId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const messages = await prisma.chatMessage.findMany({
      where: { examSessionId },
      include: {
        sender: { select: { name: true, image: true, id: true } }
      },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { examSessionId, content } = body

    if (!examSessionId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user is part of this session
    const examSession = await prisma.examSession.findUnique({
      where: { id: examSessionId },
      select: { studentId: true, examinerId: true }
    })

    if (!examSession) {
      return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })
    }

    if (examSession.studentId !== session.user.id && examSession.examinerId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const message = await prisma.chatMessage.create({
      data: {
        content,
        senderId: session.user.id,
        examSessionId
      },
      include: {
        sender: { select: { name: true, image: true, id: true } }
      }
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error creating chat message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
