import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getToken } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'

// GET /api/editor/comments/related - جلب التعليقات ذات الصلة للمحرّر
// بازگرداندن لیست پست‌هایی که کامنت‌های مرتبط با کاربر فعلی دارند
// معیار «مرتبط»:
// 1) کامنت‌هایی روی پست‌های من که توسط دیگران نوشته شده باشد
// 2) پاسخ‌هایی که به کامنت‌های من داده شده باشد
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    const email = (token as any)?.email || session?.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const me = await prisma.user.findUnique({ where: { email } })
    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // فقط ویرایشگر و ادمین
    if (me.role !== 'EDITOR' && me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // دریافت کامنت‌های مرتبط با «من» با جزئیات لازم برای نمایش
    const relatedComments = await prisma.comment.findMany({
      where: {
        OR: [
          // کامنت‌هایی روی پست‌های من (به جز کامنت‌های خودم)
          {
            post: { authorId: me.id },
            NOT: { authorId: me.id },
          },
          // پاسخ‌هایی به کامنت‌های من
          {
            parent: { authorId: me.id },
          },
        ],
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        postId: true,
        author: { select: { id: true, name: true, role: true } },
        post: {
          select: {
            id: true,
            version: true,
            revisionNumber: true,
            status: true,
            originalPost: { select: { version: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json(relatedComments)
  } catch (error) {
    console.error('Error fetching related comments for editor:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}