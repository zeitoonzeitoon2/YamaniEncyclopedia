import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'غیر مجاز' }, { status: 401 })
    }

    const { id } = params

    // Find the draft by ID
    const draft = await prisma.articleDraft.findUnique({
      where: {
        id: id
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    if (!draft) {
      return NextResponse.json({ error: 'پیش‌نویس یافت نشد' }, { status: 404 })
    }

    // Check if user has permission to view this draft
    // Supervisors and admins can view all drafts, authors can view their own drafts
    const canView = 
      session.user.role === 'SUPERVISOR' || 
      session.user.role === 'ADMIN' || 
      draft.authorId === session.user.id

    if (!canView) {
      return NextResponse.json({ error: 'دسترسی غیر مجاز' }, { status: 403 })
    }

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      content: draft.content,
      slug: draft.slug,
      description: draft.description,
      originalArticleSlug: draft.originalArticleSlug,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      author: draft.author
    })

  } catch (error) {
    console.error('Error fetching draft:', error)
    return NextResponse.json(
      { error: 'خطا در دریافت پیش‌نویس' },
      { status: 500 }
    )
  }
}