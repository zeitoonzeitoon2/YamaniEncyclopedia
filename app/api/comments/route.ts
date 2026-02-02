import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - دریافت کامنت‌های یک پست
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = (searchParams.get('postId') || '').trim()
    const chapterId = (searchParams.get('chapterId') || '').trim()

    if (!postId && !chapterId) {
      return NextResponse.json({ error: 'postId or chapterId is required' }, { status: 400 })
    }
    if (postId && chapterId) {
      return NextResponse.json({ error: 'Only one of postId or chapterId is allowed' }, { status: 400 })
    }
    const whereTarget = postId ? { postId } : { chapterId }

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
        where: whereTarget,
        select: {
          id: true,
          content: true,
          createdAt: true,
          tag: true,
          parentId: true,
          author: { select: { id: true, name: true, role: true, image: true } },
          poll: {
            select: {
              id: true,
              question: true,
              options: { select: { id: true, text: true } },
              votes: { select: { optionId: true } },
            }
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      const normalized = all.map(c => {
        const poll = c.poll ? (() => {
          const counts: Record<string, number> = {}
          for (const v of c.poll.votes) counts[v.optionId] = (counts[v.optionId] || 0) + 1
          return {
            id: c.poll.id,
            question: c.poll.question,
            options: c.poll.options.map(o => ({ id: o.id, text: o.text, count: counts[o.id] || 0 })),
            totalVotes: c.poll.votes.length,
          }
        })() : undefined
        return {
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          parentId: c.parentId,
          author: c.author,
          category: c.tag || undefined,
          ...(poll ? { poll } : {}),
        }
      })
      const tree = buildTree(normalized as any)
      return NextResponse.json(tree)
    } catch (dbErr) {
      console.error('GET /api/comments with tag failed, retrying without tag:', dbErr)
      const all = await prisma.comment.findMany({
        where: whereTarget,
        select: {
          id: true,
          content: true,
          createdAt: true,
          parentId: true,
          author: { select: { id: true, name: true, role: true, image: true } },
          poll: {
            select: {
              id: true,
              question: true,
              options: { select: { id: true, text: true } },
              votes: { select: { optionId: true } },
            }
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      const normalized = all.map(c => {
        const poll = c.poll ? (() => {
          const counts: Record<string, number> = {}
          for (const v of c.poll.votes) counts[v.optionId] = (counts[v.optionId] || 0) + 1
          return {
            id: c.poll.id,
            question: c.poll.question,
            options: c.poll.options.map(o => ({ id: o.id, text: o.text, count: counts[o.id] || 0 })),
            totalVotes: c.poll.votes.length,
          }
        })() : undefined
        return {
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          parentId: c.parentId,
          author: c.author,
          ...(poll ? { poll } : {}),
        }
      })
      const tree = buildTree(normalized as any)
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
    const postId = typeof body?.postId === 'string' ? body.postId.trim() : ''
    const chapterId = typeof body?.chapterId === 'string' ? body.chapterId.trim() : ''
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

    if (!content?.trim() || (!postId && !chapterId)) {
      return NextResponse.json({ error: 'Content and postId or chapterId are required' }, { status: 400 })
    }
    if (postId && chapterId) {
      return NextResponse.json({ error: 'Only one of postId or chapterId is allowed' }, { status: 400 })
    }

    if (postId) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true },
      })
      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      }
    }

    if (chapterId) {
      const chapter = await prisma.courseChapter.findUnique({
        where: { id: chapterId },
        select: { id: true },
      })
      if (!chapter) {
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
      }
    }

    // اگر parentId وجود دارد، بررسی وجود کامنت والد
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, chapterId: true },
      })

      if (!parentComment) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 })
      }
      if (postId && parentComment.postId !== postId) {
        return NextResponse.json({ error: 'Parent comment mismatch' }, { status: 400 })
      }
      if (chapterId && parentComment.chapterId !== chapterId) {
        return NextResponse.json({ error: 'Parent comment mismatch' }, { status: 400 })
      }
    }

    try {
      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          ...(postId ? { postId } : {}),
          ...(chapterId ? { chapterId } : {}),
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
            ...(postId ? { postId } : {}),
            ...(chapterId ? { chapterId } : {}),
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
