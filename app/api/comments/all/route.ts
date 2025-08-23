import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - دریافت تمام کامنت‌ها به ترتیب تازگی
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // بررسی دسترسی ناظر/ادمین
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user || (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const comments = await prisma.comment.findMany({
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        post: {
          select: {
            id: true,
            version: true,
            revisionNumber: true,
            status: true,
            originalPost: {
              select: { version: true }
            }
          }
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Error fetching all comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}