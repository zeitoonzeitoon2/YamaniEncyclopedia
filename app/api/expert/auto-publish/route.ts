import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextVersion } from '@/lib/postUtils'
import { processArticlesData } from '@/lib/articleUtils'
import { getPostDisplayId } from '@/lib/postDisplay'
import { checkScoreApproval } from '@/lib/voting-utils'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId } = await request.json()

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true },
    })

    if (!me) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        content: true,
        articlesData: true,
        authorId: true,
        originalPostId: true,
        domainId: true,
        relatedDomainIds: true,
        votes: { select: { score: true, adminId: true, domainId: true } },
        originalPost: { select: { id: true, version: true, content: true } },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const isExpert = me.role === 'EXPERT' || me.role === 'ADMIN'
    if (!isExpert) {
      const allPostDomains = [post.domainId, ...(Array.isArray(post.relatedDomainIds) ? post.relatedDomainIds : [])].filter(Boolean) as string[]
      
      if (allPostDomains.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      const expert = await prisma.domainExpert.findFirst({
        where: { 
          userId: me.id, 
          domainId: { in: allPostDomains } 
        },
        select: { id: true },
      })
      if (!expert) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const [superUsers, experts] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'EXPERT'] } },
        select: { id: true },
      }),
      post.domainId
        ? prisma.domainExpert.findMany({
            where: { domainId: post.domainId },
            select: { userId: true },
          })
        : Promise.resolve([] as Array<{ userId: string }>),
    ])

    const eligibleSet = new Set<string>([...superUsers.map((u) => u.id), ...experts.map((e) => e.userId)])
    const eligibleIds = Array.from(eligibleSet)

    const allDomains = new Set<string>()
    if (post.domainId) allDomains.add(post.domainId)
    if (post.relatedDomainIds && Array.isArray(post.relatedDomainIds)) {
      post.relatedDomainIds.forEach((id: string) => allDomains.add(id))
    }

    let isApproved = false
    let failureMessage = ''
    let totalScore = 0
    let threshold = 0

    if (allDomains.size > 0) {
       let allDomainsApproved = true
       const domainStatuses: string[] = []

       for (const dId of Array.from(allDomains)) {
          const domainVotes = post.votes.filter((v: any) =>
             v.domainId === dId || (v.domainId === null && dId === post.domainId)
          )
          const result = await checkScoreApproval(
            dId,
            domainVotes.map((v: any) => ({ voterId: v.adminId, score: v.score })),
            { noRejection: true }
          )

          if (!result.approved) {
             allDomainsApproved = false
             domainStatuses.push(`Domain ${dId}: (Score ${result.totalScore}/${result.totalRights / 2}, Participation ${result.voterCount}/${result.eligibleCount})`)
          }
       }

       if (allDomainsApproved) {
          isApproved = true
          totalScore = 100
          threshold = 100
       } else {
          failureMessage = 'عدم حد نصاب در حوزه‌های: ' + domainStatuses.join(', ')
       }

    } else {
       threshold = Math.ceil(eligibleIds.length / 2)
       totalScore = post.votes.reduce((sum: number, v: any) => (eligibleSet.has(v.adminId) ? sum + v.score : sum), 0)
       const participationCount = await prisma.vote.count({
          where: { postId, adminId: { in: eligibleIds } }
       })

       if (participationCount >= threshold && totalScore >= threshold) {
          isApproved = true
       } else {
          failureMessage = 'مشارکت یا امتیاز به حد نصاب نرسیده است'
       }
    }

    if (!isApproved) {
        return NextResponse.json({
          success: true,
          published: false,
          action: 'pending',
          message: failureMessage
        })
    }

    if (isApproved) {
        // امتیاز مثبت - تایید طرح
        let rebaseToId: string | null = null
        if (post.originalPostId) {
          const baseVersion = post.originalPost?.version ?? null
          const live = await prisma.post.findFirst({
            where: { status: 'APPROVED', type: post.type, version: { not: null } },
            orderBy: { version: 'desc' },
            select: { id: true, version: true },
          })

          const liveVersion = live?.version ?? null
          if (baseVersion != null && liveVersion != null && baseVersion < liveVersion) {
            const [domains, publishedBetween] = await Promise.all([
              prisma.domain.findMany({
                select: { id: true, name: true, parentId: true },
              }),
              prisma.post.findMany({
                where: {
                  type: post.type,
                  status: { in: ['APPROVED', 'ARCHIVED'] },
                  version: { gt: baseVersion, lte: liveVersion },
                },
                select: { version: true, domainId: true, content: true },
                orderBy: { version: 'asc' },
              }),
            ])

            const getChangedNodeIds = (baseContent: string | null, newContent: string | null) => {
              const changedIds = new Set<string>()
              try {
                const baseTree = JSON.parse(baseContent || '{"nodes":[],"edges":[]}')
                const newTree = JSON.parse(newContent || '{"nodes":[],"edges":[]}')
                const baseNodes = Array.isArray(baseTree.nodes) ? baseTree.nodes : []
                const newNodes = Array.isArray(newTree.nodes) ? newTree.nodes : []
                
                const baseMap = new Map(baseNodes.map((n: any) => [n.id, n]))
                for (const n of newNodes) {
                  const b = baseMap.get(n.id)
                  if (!b) {
                    changedIds.add(n.id)
                  } else if (
                    n.data?.label !== b.data?.label ||
                    n.data?.domainId !== b.data?.domainId ||
                    n.data?.flashText !== b.data?.flashText ||
                    n.data?.articleLink !== b.data?.articleLink
                  ) {
                    changedIds.add(n.id)
                  }
                }
                for (const b of baseNodes) {
                  if (!newNodes.find((n: any) => n.id === b.id)) changedIds.add(b.id)
                }

                const baseEdges = Array.isArray(baseTree.edges) ? baseTree.edges : []
                const newEdges = Array.isArray(newTree.edges) ? newTree.edges : []
                const baseEdgeSet = new Set(baseEdges.map(e => `${e.source}->${e.target}`))
                const newEdgeSet = new Set(newEdges.map(e => `${e.source}->${e.target}`))
                
                for (const e of newEdges) {
                  if (!baseEdgeSet.has(`${e.source}->${e.target}`)) {
                    changedIds.add(e.source); changedIds.add(e.target);
                  }
                }
                for (const e of baseEdges) {
                  if (!newEdgeSet.has(`${e.source}->${e.target}`)) {
                    changedIds.add(e.source); changedIds.add(e.target);
                  }
                }
              } catch (e) {
                console.error("Error parsing tree for conflict check", e)
              }
              return Array.from(changedIds)
            }

            const getDescendants = (nodeIds: string[], content: string | null): Set<string> => {
              const descendants = new Set<string>()
              try {
                const tree = JSON.parse(content || '{"nodes":[],"edges":[]}')
                const edges = Array.isArray(tree.edges) ? tree.edges : []
                const childrenMap = new Map<string, string[]>()
                for (const e of edges) {
                  if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
                  childrenMap.get(e.source)!.push(e.target)
                }
                
                const stack = [...nodeIds]
                while (stack.length) {
                  const cur = stack.pop()!
                  if (!descendants.has(cur)) {
                    descendants.add(cur)
                    const kids = childrenMap.get(cur)
                    if (kids) stack.push(...kids)
                  }
                }
              } catch (e) {}
              return descendants
            }

            const baseContent = post.originalPost?.content || null
            const draftChangedNodes = getChangedNodeIds(baseContent, post.content)
            const draftDescendants = getDescendants(draftChangedNodes, post.content)

            let conflict: { version: number; domainId: string } | null = null
            for (const pub of publishedBetween) {
              if (pub.version == null) continue
              
              const pubChangedNodes = getChangedNodeIds(baseContent, pub.content)
              const pubDescendants = getDescendants(pubChangedNodes, pub.content)
              
              let intersects = false
              for (const id of Array.from(pubDescendants)) {
                if (draftDescendants.has(id)) {
                  intersects = true
                  break
                }
              }
              
              if (intersects) {
                conflict = { version: pub.version, domainId: pub.domainId || 'unknown' }
                break
              }
            }

            if (conflict) {
              await prisma.post.update({
                where: { id: postId },
                data: { status: 'REVIEWABLE' },
              })

              const domainName = domains.find(d => d.id === conflict?.domainId)?.name || 'غير معروف'
              const draftDisplayId = getPostDisplayId({
                id: post.id,
                status: post.status,
                version: post.version,
                revisionNumber: post.revisionNumber,
                originalPost: post.originalPost ? { version: post.originalPost.version } : null,
              })

              return NextResponse.json({
                success: true,
                published: false,
                action: 'reviewable',
                message: `حصل تصميمك رقم ${draftDisplayId} على نقاط، لكن تم نشر تعديل آخر في مجال '${domainName}' في الإصدار رقم ${conflict.version}. لذلك وُسِم تصميمك بأنه «قابل للمراجعة» لتحديثه.`,
                totalScore,
                threshold,
                reviewable: true,
              })
            }

            if (live?.id) rebaseToId = live.id
          }
        }
        const version = await generateNextVersion()

        await prisma.$transaction(async (tx) => {
          const archiveTargetId = rebaseToId || post.originalPostId
          if (archiveTargetId) {
            await tx.post.update({
              where: { id: archiveTargetId },
              data: { status: 'ARCHIVED' }
            })
          }
          await tx.post.update({
            where: { id: postId },
            data: {
              status: 'APPROVED',
              version: version,
              revisionNumber: null,
              ...(rebaseToId ? { originalPostId: rebaseToId } : {}),
            }
          })
        })

        // پردازش داده‌های مقالات (در صورت وجود) و پاکسازی لینک‌های نمودار
        try {
          if (post.articlesData) {
            await processArticlesData(post.articlesData, post.authorId)
          }

          const treeData = JSON.parse(post.content)

          // جمع‌آوری پیش‌نویس‌های موجود در extraItems برای سازگاری عقب‌رو
          try {
            const existingSlugs = new Set<string>()
            try {
              if (post.articlesData) {
                const parsed = JSON.parse(post.articlesData)
                if (parsed?.drafts && Array.isArray(parsed.drafts)) {
                  parsed.drafts.forEach((d: any) => { if (d?.slug) existingSlugs.add(d.slug) })
                }
              }
            } catch {}

            const extraDrafts: any[] = []
            for (const node of (treeData.nodes || [])) {
              const items: any[] = Array.isArray(node?.data?.extraItems) ? node.data.extraItems : []
              const nodeLabel = node?.data?.label
              items.forEach((it: any) => {
                if (it?.type === 'link' && it?.draft && it.draft.title && it.draft.content) {
                  const slug = it.draft.slug
                  if (!slug || !existingSlugs.has(slug)) {
                    extraDrafts.push({ ...it.draft, nodeId: node.id, nodeLabel })
                    if (slug) existingSlugs.add(slug)
                  }
                }
              })
            }
            if (extraDrafts.length > 0) {
              await processArticlesData(JSON.stringify({ version: '1', type: 'drafts', drafts: extraDrafts }), post.authorId)
            }
          } catch (e) {
            console.warn('خطا در گردآوری extraItems drafts (ناظر):', e)
          }

          const updatedNodes = (treeData.nodes || []).map((node: any) => {
            let working: any = { ...node }

            // 1) إنهاء articleDraft الرئيسي -> articleLink
            if (working?.data?.articleDraft) {
              const { articleDraft, draftId, ...restData } = working.data
              working = {
                ...working,
                data: {
                  ...restData,
                  articleLink: `/articles/${articleDraft.slug}`
                }
              }
            } else if (working?.data?.draftId) {
              // 2) التوافق العكسي لحقل draftId على المستوى الأعلى
              const raw = String(working.data.draftId || '')
              let path = raw.trim()
              try {
                if (/^https?:\/\//i.test(path)) {
                  const u = new URL(path)
                  path = u.pathname
                }
              } catch {}
              path = path.split('?')[0].split('#')[0]
              path = path.replace(/^\/?/, '/')
              const slug = path.replace(/^\/?articles\//, '').replace(/\/+$/g, '')
              const finalLink = slug ? `/articles/${slug}` : (working.data.articleLink || '')
              const { draftId, ...restData } = working.data
              working = {
                ...working,
                data: {
                  ...restData,
                  articleLink: finalLink
                }
              }
            }

            // 3) إنهاء روابط extraItems وإزالة بيانات المسودة
            if (Array.isArray(working?.data?.extraItems)) {
              const updatedItems = (working.data.extraItems as any[]).map((it: any) => {
                if (it?.type !== 'link') return it

                // إذا كانت لدينا بيانات مسودة تحتوي على slug، حوّلها إلى رابط نهائي واحذف حقل draft
                if (it?.draft?.slug) {
                  const { draft, ...restItem } = it
                  return {
                    ...restItem,
                    content: `/articles/${draft.slug}`
                  }
                }

                // توافقًا مع الإصدارات السابقة: توحيد draftId على مستوى العنصر
                if (it?.draftId) {
                  let path = String(it.draftId).trim()
                  try {
                    if (/^https?:\/\//i.test(path)) {
                      const u = new URL(path)
                      path = u.pathname
                    }
                  } catch {}
                  path = path.split('?')[0].split('#')[0]
                  path = path.replace(/^\/?/, '/')
                  const slug = path.replace(/^\/?articles\//, '').replace(/\/+$/g, '')
                  const finalLink = slug ? `/articles/${slug}` : (it.content || '')
                  const { draftId, ...restItem } = it
                  return { ...restItem, content: finalLink }
                }

                return it
              })

              const extraTexts = updatedItems.filter((i: any) => i?.type === 'text').map((i: any) => i.content)
              const extraLinks = updatedItems.filter((i: any) => i?.type === 'link').map((i: any) => i.content)

              working = {
                ...working,
                data: {
                  ...(working.data || {}),
                  extraItems: updatedItems,
                  extraTexts,
                  extraLinks
                }
              }
            }

            return working
          })

          const updatedTreeData = { ...treeData, nodes: updatedNodes }

          await prisma.post.update({
            where: { id: postId },
            data: {
              content: JSON.stringify(updatedTreeData),
              articlesData: null,
            },
          })
        } catch (error) {
          console.error('خطا در پاکسازی/انتشار مقالات پس از تایید:', error)
        }

        return NextResponse.json({
          success: true,
          published: true,
          action: 'approved',
          message: 'طرح به دلیل رسیدن به حد نصاب مثبت تایید شد',
          totalScore,
          threshold
        })
      }

  } catch (error) {
    console.error('Error in auto-publish:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
