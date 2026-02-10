import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextRevisionNumber } from '@/lib/postUtils'
import { Prisma } from '@prisma/client'
import { canEditDomainDiagram } from '@/lib/course-utils'

function isSeriousChange(oldContent: string, newContent: string): boolean {
  try {
    const oldTree = JSON.parse(oldContent)
    const newTree = JSON.parse(newContent)

    const oldNodes = Array.isArray(oldTree?.nodes) ? oldTree.nodes : []
    const newNodes = Array.isArray(newTree?.nodes) ? newTree.nodes : []
    const oldEdges = Array.isArray(oldTree?.edges) ? oldTree.edges : []
    const newEdges = Array.isArray(newTree?.edges) ? newTree.edges : []

    // 1. Check if number of nodes or edges changed
    if (oldNodes.length !== newNodes.length) return true
    if (oldEdges.length !== newEdges.length) return true

    // 2. Check if any node's critical data changed (label, domainId, flashText, etc.)
    for (let i = 0; i < newNodes.length; i++) {
      const newNode = newNodes[i]
      const oldNode = oldNodes.find((n: any) => n.id === newNode.id)
      
      if (!oldNode) return true // Node added or ID changed
      
      if (newNode.data?.label !== oldNode.data?.label) return true
      if (newNode.data?.domainId !== oldNode.data?.domainId) return true
      if (newNode.data?.flashText !== oldNode.data?.flashText) return true
      if (newNode.data?.articleLink !== oldNode.data?.articleLink) return true
      // Position changes are NOT serious
    }

    // 3. Check if any edge's structure changed
    for (let i = 0; i < newEdges.length; i++) {
      const newEdge = newEdges[i]
      const oldEdge = oldEdges.find((e: any) => e.id === newEdge.id)
      if (!oldEdge) return true
      if (newEdge.source !== oldEdge.source || newEdge.target !== oldEdge.target) return true
    }

    return false
  } catch {
    return true // If parsing fails, assume it's serious
  }
}

// واجهة برمجة التطبيقات (API) الخاصة بالمنشورات

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const content = typeof body.content === 'string' ? body.content : ''
    const type = typeof body.type === 'string' ? body.type : 'TREE'
    const originalPostId = typeof body.originalPostId === 'string' ? body.originalPostId : undefined
    const changeReason = body.changeReason
    const changeSummary = typeof body.changeSummary === 'string' ? body.changeSummary : undefined
    const articlesData = typeof body.articlesData === 'string' ? body.articlesData : undefined
    const requestedDomainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''

    // داده‌های مقالات همان ورودی articlesData از کلاینت است؛ استخراج draftId دیگر انجام نمی‌شود
    const finalArticlesData = articlesData && articlesData.trim() ? articlesData : undefined
    
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // --- PERMISSION CHECK START ---
    let seriousChange = true
    if (originalPostId) {
      const originalPost = await prisma.post.findUnique({
        where: { id: originalPostId },
        select: { content: true }
      })
      if (originalPost) {
        seriousChange = isSeriousChange(originalPost.content, content)
      }
    }

    if (seriousChange) {
      // Extract all domainIds from the new content
      let affectedDomainIds = new Set<string>()
      try {
        const tree = JSON.parse(content)
        if (Array.isArray(tree?.nodes)) {
          tree.nodes.forEach((n: any) => {
            const did = n?.data?.domainId
            if (did && typeof did === 'string') affectedDomainIds.add(did.trim())
          })
        }
      } catch {}

      // If requestedDomainId is provided, add it too
      if (requestedDomainId && typeof requestedDomainId === 'string') {
        affectedDomainIds.add(requestedDomainId.trim())
      }

      // Check permission for each unique domain
      const domainIdsArray = Array.from(affectedDomainIds).filter(Boolean)
      for (const dId of domainIdsArray) {
        if (!dId || dId === 'undefined' || dId === 'null') continue

        const hasPermission = await canEditDomainDiagram(user.id, dId)
        if (!hasPermission) {
          return NextResponse.json({ 
            error: `You do not have the required research prerequisites for domain: ${dId}`,
            code: 'INSUFFICIENT_PREREQUISITES',
            domainId: dId
          }, { status: 403 })
        }
      }
    }
    // --- PERMISSION CHECK END ---

    let version = null
    let revisionNumber = null

    if (originalPostId) {
      // این یک ویرایش پیشنهادی است
      revisionNumber = await generateNextRevisionNumber(originalPostId)
    } else {
      // این یک نمودار جدید است که در انتظار تایید است
      // version و revisionNumber null می‌مانند تا زمان تایید
    }

    let normalizedContent = content
    let relatedDomainIds: string[] = []
    let postDomainId: string | null = requestedDomainId || null

    try {
      const tree = JSON.parse(content)
      const nodesArr = Array.isArray(tree?.nodes) ? tree.nodes : null
      const edgesArr = Array.isArray(tree?.edges) ? tree.edges : null

      if (nodesArr) {
        const byId: Record<string, any> = {}
        for (let i = 0; i < nodesArr.length; i++) {
          const n = nodesArr[i]
          if (n && typeof n.id === 'string') byId[n.id] = n
        }

        if (edgesArr) {
          for (let i = 0; i < edgesArr.length; i++) {
            const e = edgesArr[i]
            const sourceId = typeof e?.source === 'string' ? e.source : null
            const targetId = typeof e?.target === 'string' ? e.target : null
            if (!sourceId || !targetId) continue
            const src = byId[sourceId]
            const tgt = byId[targetId]
            const srcDomainIdRaw = src?.data?.domainId
            const tgtDomainIdRaw = tgt?.data?.domainId
            const srcDomainId = typeof srcDomainIdRaw === 'string' ? srcDomainIdRaw.trim() : ''
            const tgtDomainId = typeof tgtDomainIdRaw === 'string' ? tgtDomainIdRaw.trim() : ''
            if (srcDomainId && !tgtDomainId) {
              tgt.data = { ...(tgt.data || {}), domainId: srcDomainId }
            }
          }
        }

        const collected: string[] = []
        for (let i = 0; i < nodesArr.length; i++) {
          const n = nodesArr[i]
          const didRaw = n?.data?.domainId
          const did = typeof didRaw === 'string' ? didRaw.trim() : ''
          if (did) collected.push(did)
        }

        const unique = Array.from(new Set(collected))
        const candidates = Array.from(new Set([...(postDomainId ? [postDomainId] : []), ...unique]))

        if (candidates.length > 0) {
          const existing = await prisma.domain.findMany({
            where: { id: { in: candidates } },
            select: { id: true },
          })
          const validSet = new Set(existing.map((d) => d.id))
          relatedDomainIds = unique.filter((id) => validSet.has(id))
          postDomainId = (postDomainId && validSet.has(postDomainId)) ? postDomainId : (relatedDomainIds[0] || null)

          for (let i = 0; i < nodesArr.length; i++) {
            const n = nodesArr[i]
            const didRaw = n?.data?.domainId
            const did = typeof didRaw === 'string' ? didRaw.trim() : ''
            if (did && !validSet.has(did)) {
              n.data = { ...(n.data || {}), domainId: null }
            }
          }
        } else {
          postDomainId = null
          relatedDomainIds = []
        }
      }

      normalizedContent = JSON.stringify(tree)
    } catch {
      normalizedContent = content
    }

    const post = await prisma.post.create({
      data: {
        content: normalizedContent,
        type,
        authorId: user.id,
        status: 'PENDING',
        version,
        revisionNumber,
        ...(postDomainId ? { domainId: postDomainId } : {}),
        relatedDomainIds,
        ...(finalArticlesData ? { articlesData: finalArticlesData } : {}),
        ...(originalPostId ? { originalPostId } : {}),
        ...(changeReason ? { changeReason: (changeReason as any) as Prisma.InputJsonValue } : {}),
        ...(changeSummary ? { changeSummary } : {}),
      }
    })

    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    console.error('Error creating post:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' 
        ? (error instanceof Error ? error.message : (typeof error === 'string' ? error : undefined)) 
        : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            name: true,
            image: true
          }
        },
        votes: {
          select: {
            score: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // محاسبه امتیاز کل و فیلتر کردن پست‌ها
    const postsWithScores = posts.map(post => {
      const totalScore = post.votes.reduce((sum, vote) => sum + vote.score, 0)
      const hasVotes = post.votes.length > 0
      return {
        ...post,
        totalScore,
        hasVotes,
        votes: undefined // حذف votes از response برای امنیت
      }
    })

    // نمایش فقط پست‌هایی که حداقل یک رای دارند و امتیاز مثبت دارند
    const publishedPosts = postsWithScores.filter(post => 
      post.hasVotes && post.totalScore > 0
    )

    // مرتب‌سازی بر اساس امتیاز (بیشترین امتیاز اول)
    publishedPosts.sort((a, b) => b.totalScore - a.totalScore)

    // نمایش فقط بالاترین امتیاز
    const topPost = publishedPosts.length > 0 ? [publishedPosts[0]] : []

    return NextResponse.json(topPost)
  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// واجهة برمجة التطبيقات (API) الخاصة بالمنشورات
