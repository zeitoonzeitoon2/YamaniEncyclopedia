import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const me = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!me || !['USER','EDITOR','SUPERVISOR','ADMIN'].includes(me.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const commentId = String(body?.commentId || '')
    const question = body?.question ? String(body.question) : null
    const rawOptions: string[] = Array.isArray(body?.options) ? body.options.map((s: any) => String(s).trim()).filter(Boolean) : []

    if (!commentId || rawOptions.length < 2) {
      return NextResponse.json({ error: 'commentId and at least 2 options required' }, { status: 400 })
    }

    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true, authorId: true, poll: { select: { id: true } } } })
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    if (comment.poll) return NextResponse.json({ error: 'Poll already exists for this comment' }, { status: 409 })
    // Editors and supervisors can create polls on any comment

    const poll = await prisma.commentPoll.create({
      data: {
        commentId: comment.id,
        question: question || null,
        createdById: me.id,
        options: {
          create: rawOptions.map(text => ({ text }))
        }
      },
      select: { id: true }
    })

    return NextResponse.json({ id: poll.id }, { status: 201 })
  } catch (error) {
    console.error('Error creating comment poll:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}