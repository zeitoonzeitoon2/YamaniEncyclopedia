import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'

export async function GET(request: NextRequest) {
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

    // بررسی دسترسی ویرایشگر
    if (user.role !== 'EDITOR' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const posts = await prisma.post.findMany({
      select: {
        id: true,
        content: true,
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
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const postIds = posts.map(p => p.id)

    // دریافت آخرین زمان خواندن کاربر برای هر پست
    const reads = postIds.length ? await prisma.commentRead.findMany({
      where: { userId: user.id, postId: { in: postIds } },
      select: { postId: true, lastReadAt: true },
    }) : []
    const readMap = new Map<string, Date>()
    for (const r of reads) readMap.set(r.postId, r.lastReadAt)

    // محاسبه تعداد کامنت‌های جدید برای هر پست (نویسنده خودش حساب نشود)
    const unreadCounts: Record<string, number> = {}
    for (const postId of postIds) {
      const lastReadAt = readMap.get(postId)
      const count = await prisma.comment.count({
        where: {
          postId,
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          NOT: { authorId: user.id },
        },
      })
      unreadCounts[postId] = count
    }

    // Aggregate latest comment time and total comments per post
    const commentsAgg = postIds.length > 0 ? await prisma.comment.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds } },
      _max: { createdAt: true },
      _count: { _all: true },
    }) : []

    const commentsMap = new Map<string, { latestCommentAt: Date | null; commentsCount: number }>()
    for (const row of commentsAgg) {
      commentsMap.set(row.postId, {
        latestCommentAt: row._max.createdAt ?? null,
        commentsCount: row._count._all ?? 0,
      })
    }

    const postsWithMeta = posts.map(post => {
      const cm = commentsMap.get(post.id)
      return {
        ...post,
        latestCommentAt: cm?.latestCommentAt || null,
        commentsCount: cm?.commentsCount ?? (post._count?.comments ?? 0),
        unreadComments: unreadCounts[post.id] || 0,
      }
    })

    return NextResponse.json(postsWithMeta)
  } catch (error) {
    console.error('Error fetching editor posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}