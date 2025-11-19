import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

    // Editors/Admins can view all posts; regular users see only their own posts by default
    const isPrivileged = user.role === 'EDITOR' || user.role === 'ADMIN'
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')
    const forceAll = scope === 'all'

    // Pagination params with sane limits
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '20', 10)
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = Number.isNaN(pageSizeParam) ? 20 : Math.min(Math.max(pageSizeParam, 1), 50)

    const where = (isPrivileged || forceAll) ? {} : { authorId: user.id }

    // Total count for pagination UI
    const totalCount = await prisma.post.count({ where })

    // Lightweight list: do NOT fetch heavy fields (content, articlesData)
    const posts = await prisma.post.findMany({
      where,
      select: {
        id: true,
        // حذف فیلدهای سنگین از لیست
        // content: true,
        // articlesData: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        author: {
          select: { id: true, name: true, email: true, image: true, role: true },
        },
        originalPost: {
          // بدون محتوا، فقط متادیتا
          select: { id: true, /* content: true, */ type: true, version: true },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    const postIds = posts.map(p => p.id)

    // آخرین زمان خواندن کاربر برای پست‌های صفحه جاری
    const reads = postIds.length ? await prisma.commentRead.findMany({
      where: { userId: user.id, postId: { in: postIds } },
      select: { postId: true, lastReadAt: true },
    }) : []
    const readMap = new Map<string, Date>()
    for (const r of reads) readMap.set(r.postId, r.lastReadAt)

    // تجميع وقت أحدث تعليق وإجمالي التعليقات لكل منشور (تنها برای همین صفحه)
    const commentsAgg = postIds.length ? await prisma.comment.groupBy({
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

    // محاسبه تعداد کامنت‌های خوانده‌نشده فقط برای آیتم‌های همین صفحه (در صورت نیاز می‌توان جداگانه lazy-load کرد)
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

    const items = posts.map(post => {
      const cm = commentsMap.get(post.id)
      return {
        ...post,
        latestCommentAt: cm?.latestCommentAt || null,
        commentsCount: cm?.commentsCount ?? (post._count?.comments ?? 0),
        unreadComments: unreadCounts[post.id] || 0,
      }
    })

    return NextResponse.json({
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      hasNext: page * pageSize < totalCount,
    })
  } catch (error) {
    console.error('Error fetching editor posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}