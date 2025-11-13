import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RouteParams = { params: { id: string } }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    const email = (token as any)?.email || session?.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const postId = params.id
    const isPrivileged = user.role === 'EDITOR' || user.role === 'ADMIN'

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        content: true,            // داده‌ی سنگین لازم برای نمایش
        articlesData: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, email: true, image: true, role: true },
        },
        originalPost: {
          select: { id: true, content: true, type: true, version: true },
        },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // محدودیت دسترسی: غیر مدیر/ویرایشگر فقط به پست‌های خودش دسترسی دارد
    if (!isPrivileged && post.author.id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // متادیتای کامنت‌ها (اختیاری ولی مفید برای UI)
    const [reads, commentsAgg] = await Promise.all([
      prisma.commentRead.findUnique({
        where: { userId_postId: { userId: user.id, postId } },
        select: { lastReadAt: true },
      }),
      prisma.comment.groupBy({
        by: ['postId'],
        where: { postId },
        _max: { createdAt: true },
        _count: { _all: true },
      }),
    ])

    const lastReadAt = reads?.lastReadAt ?? null
    const unreadComments = await prisma.comment.count({
      where: {
        postId,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        NOT: { authorId: user.id },
      },
    })

    const cm = commentsAgg[0]
    const latestCommentAt = cm?._max?.createdAt ?? null
    const commentsCount = cm?._count?._all ?? 0

    return NextResponse.json({
      ...post,
      unreadComments,
      latestCommentAt,
      commentsCount,
    })
  } catch (error) {
    console.error('Error fetching editor post details:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}