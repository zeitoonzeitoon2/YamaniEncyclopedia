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

    const buildTree = (items: any[]) => {
      const byId: Record<string, any> = {}
      const roots: any[] = []
      for (const it of items) {
        byId[it.id] = { ...it, replies: [] }
      }
      for (const it of items) {
        const node = byId[it.id]
        if (it.parentId) {
          const parent = byId[it.parentId]
          if (parent) parent.replies.push(node)
          else roots.push(node)
        } else {
          roots.push(node)
        }
      }
      // sort children by createdAt ascending for each node
      const sortRec = (n: any) => {
        n.replies.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        n.replies.forEach(sortRec)
      }
      roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      roots.forEach(sortRec)
      return roots
    }

    try {
      const all = await prisma.comment.findMany({
        where: { postId },
        select: {
          id: true,
          content: true,
          createdAt: true,
          tag: true,
          parentId: true,
          author: { select: { id: true, name: true, role: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      const normalized = all.map(c => ({
        ...c,
        category: c.tag || undefined,
      }))
      const tree = buildTree(normalized)
      return NextResponse.json(tree)
    } catch (dbErr) {
      console.error('GET /api/comments with tag failed, retrying without tag:', dbErr)
      const all = await prisma.comment.findMany({
        where: { postId },
        select: {
          id: true,
          content: true,
          createdAt: true,
          parentId: true,
          author: { select: { id: true, name: true, role: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      const tree = buildTree(all)
      return NextResponse.json(tree)
    }
  } catch (error) {
    console.error('Error fetching comments:', error)
    const msg = (error as any)?.message || 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
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
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      console.error('Invalid JSON body for comment:', e)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const content = body?.content
    const postId = body?.postId
    const parentId = body?.parentId
    let tag: string | null = body?.tag ?? body?.category ?? null

    const mapTag = (val: any): string | null => {
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
    tag = mapTag(tag)

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

    try {
      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          postId,
          authorId: session.user.id,
          parentId: parentId || null,
          ...(tag ? { tag } : {}),
        },
        include: {
          author: { select: { id: true, name: true, role: true, image: true } },
        },
      })
      return NextResponse.json(comment, { status: 201 })
    } catch (dbErr) {
      console.error('Primary create comment failed, trying without tag:', dbErr)
      try {
        const comment = await prisma.comment.create({
          data: {
            content: content.trim(),
            postId,
            authorId: session.user.id,
            parentId: parentId || null,
          },
          include: {
            author: { select: { id: true, name: true, role: true, image: true } },
          },
        })
        return NextResponse.json(comment, { status: 201 })
      } catch (fallbackErr) {
        console.error('Fallback create comment failed:', fallbackErr)
        const msg = (fallbackErr as any)?.message || (dbErr as any)?.message || 'Internal server error'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  } catch (error) {
    console.error('Error creating comment:', error)
    const msg = (error as any)?.message || 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}