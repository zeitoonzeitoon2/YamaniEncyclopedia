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
    let examSessionId = searchParams.get('examSessionId')

    if (!examSessionId) {
      return NextResponse.json({ error: 'Exam session ID is required' }, { status: 400 })
    }

    // Handle virtual course-based session IDs
    if (examSessionId.startsWith('course-')) {
      return NextResponse.json({ messages: [] })
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

    let messages: any[] = []
    try {
      messages = await prisma.chatMessage.findMany({
        where: { examSessionId },
        include: {
          sender: { select: { name: true, image: true, id: true } }
        },
        orderBy: { createdAt: 'asc' }
      })
    } catch (dbError) {
      console.error('[DEBUG] ChatMessage table might be missing:', dbError)
      // Return empty messages if table doesn't exist yet
    }

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
    let { examSessionId, content } = body

    if (!examSessionId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Handle virtual course-based session IDs by creating a real one
    if (examSessionId.startsWith('course-')) {
      const courseId = examSessionId.replace('course-', '')
      
      // Check if real session was created in the meantime
      const existing = await prisma.examSession.findFirst({
        where: { studentId: session.user.id, courseId, status: 'ENROLLED' }
      })

      if (existing) {
        examSessionId = existing.id
      } else {
        const newSession = await prisma.examSession.create({
          data: {
            studentId: session.user.id,
            courseId,
            status: 'ENROLLED'
          }
        })
        examSessionId = newSession.id
      }
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

    try {
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
    } catch (dbError: any) {
      console.error('[CRITICAL] Failed to save message. Table ChatMessage likely missing:', dbError)
      
      // Fallback: If DB sync is not finished, simulate success for UI but warn
      if (dbError.code === 'P2021' || dbError.message?.includes('does not exist')) {
        return NextResponse.json({ 
          message: {
            id: 'temp-' + Date.now(),
            content,
            senderId: session.user.id,
            examSessionId,
            createdAt: new Date().toISOString(),
            sender: {
              id: session.user.id,
              name: session.user.name,
              image: (session.user as any).image || null
            }
          },
          warning: 'Database sync in progress. Message visible locally but not saved yet.'
        })
      }
      throw dbError
    }
  } catch (error) {
    console.error('Error creating chat message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
