import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Helper: extract slug from various article links like /articles/slug or full URLs
function extractSlug(link?: string | null): string | null {
  if (!link) return null
  try {
    let path = String(link)
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path)
      path = u.pathname
    }
    path = path.split('?')[0].split('#')[0]
    const after = path.replace(/^\/?articles\//, '')
    const cleaned = decodeURIComponent(after.replace(/\/+$/g, ''))
    return cleaned || null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json({ error: 'غیر مجاز' }, { status: 401 })
    }

    const idOrSlug = params.id

    // Search drafts stored inside posts (articlesData or node.data.articleDraft)
    const posts = await prisma.post.findMany({
      where: { status: { in: ['PENDING', 'REVIEWABLE'] } },
      select: {
        id: true,
        authorId: true,
        author: { select: { id: true, name: true, email: true } },
        articlesData: true,
        content: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    type DraftLike = {
      id?: string
      title: string
      content: string
      slug?: string
      description?: string
    }

    let found: { draft: DraftLike; originalSlug?: string; authorId: string; author: any } | null = null

    for (const p of posts) {
      // 1) Look into articlesData.drafts
      try {
        if (p.articlesData) {
          const parsed = JSON.parse(p.articlesData)
          if (parsed?.drafts && Array.isArray(parsed.drafts)) {
            const d = parsed.drafts.find((x: any) => x?.id === idOrSlug || x?.slug === idOrSlug)
            if (d) {
              // Try to infer original article slug from diagram nodes
              let originalSlug: string | undefined
              try {
                if (p.content) {
                  const tree = JSON.parse(p.content)
                  const nodes: any[] = Array.isArray(tree?.nodes) ? tree.nodes : []
                  for (const n of nodes) {
                    const data = n?.data || {}
                    if ((data?.articleDraft?.slug && (data.articleDraft.slug === d.slug || data.articleDraft.slug === idOrSlug)) || (data?.draftId && data.draftId === idOrSlug)) {
                      originalSlug = extractSlug(data.previousArticleLink || data.articleLink || null) || undefined
                      break
                    }
                  }
                }
              } catch {}

              found = { draft: d, originalSlug, authorId: p.authorId, author: p.author }
              break
            }
          }
        }
      } catch {}

      if (found) break

      // 2) Look into node.data.articleDraft inside post.content
      try {
        if (p.content) {
          const tree = JSON.parse(p.content)
          const nodes: any[] = Array.isArray(tree?.nodes) ? tree.nodes : []
          for (const n of nodes) {
            const data = n?.data || {}
            const d = data?.articleDraft
            if (d && (d?.id === idOrSlug || d?.slug === idOrSlug)) {
              const originalSlug = extractSlug(data.previousArticleLink || data.articleLink || null) || undefined
              found = { draft: d, originalSlug, authorId: p.authorId, author: p.author }
              break
            }
          }
        }
      } catch {}

      if (found) break
    }

    if (!found) {
      return NextResponse.json({ error: 'پیش‌نویس یافت نشد' }, { status: 404 })
    }

    // Permission check: supervisors/admins can view all, authors can view their own
    const canView =
      session.user.role === 'SUPERVISOR' ||
      session.user.role === 'ADMIN' ||
      found.authorId === session.user.id

    if (!canView) {
      return NextResponse.json({ error: 'دسترسی غیر مجاز' }, { status: 403 })
    }

    const d = found.draft

    return NextResponse.json({
      id: d.id || d.slug || idOrSlug,
      title: d.title,
      content: d.content,
      slug: d.slug || undefined,
      description: d.description,
      originalArticleSlug: found.originalSlug,
      author: found.author,
    })
  } catch (error) {
    console.error('Error fetching draft:', error)
    return NextResponse.json(
      { error: 'خطا در دریافت پیش‌نویس' },
      { status: 500 }
    )
  }
}