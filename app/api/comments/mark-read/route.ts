import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/comments/mark-read
// علامت‌زدن کامنت‌های یک پست به عنوان خوانده شده برای کاربر فعلی
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId } = await request.json()
    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    // اطمینان از وجود پست
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    await prisma.commentRead.upsert({
      where: { userId_postId: { userId: session.user.id, postId } },
      update: { lastReadAt: new Date() },
      create: { userId: session.user.id, postId, lastReadAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error marking comments as read:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}