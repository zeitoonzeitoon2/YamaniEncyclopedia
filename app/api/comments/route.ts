import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - دریافت کامنت‌های یک پست
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    const commentsRaw = await prisma.comment.findMany({
      where: {
        postId: postId,
        parentId: null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        replies: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const comments = commentsRaw.map(c => ({
      ...c,
      replies: [...(c.replies || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }))

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - ایجاد کامنت جدید
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // اجازه ارسال کامنت به تمام کاربران لاگین کرده
    const body = await request.json()
    const content = body?.content
    const postId = body?.postId
    const parentId = body?.parentId
    let category: string | null = body?.category || null

    const mapCategory = (val: any): string | null => {
      const v = String(val || '').trim().toUpperCase()
      const dict: Record<string, string> = {
        QUESTION: 'QUESTION',
        CRITIQUE: 'CRITIQUE',
        SUPPORT: 'SUPPORT',
        SUGGESTION: 'SUGGESTION',
        'سؤال': 'QUESTION',
        'نقد': 'CRITIQUE',
        'دعم': 'SUPPORT',
        'اقتراح تعديل': 'SUGGESTION',
        'پرسش': 'QUESTION',
        'حمایت': 'SUPPORT',
        'پیشنهاد اصلاح': 'SUGGESTION',
      }
      return dict[v] || dict[val] || null
    }
    category = mapCategory(category)

    if (!content?.trim() || !postId) {
      return NextResponse.json({ error: 'Content and postId are required' }, { status: 400 })
    }

    // بررسی وجود پست
    const post = await prisma.post.findUnique({
      where: { id: postId },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // اگر parentId وجود دارد، بررسی وجود کامنت والد
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      })

      if (!parentComment) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 })
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: session.user.id,
        parentId: parentId || null,
        ...(category ? { category } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}