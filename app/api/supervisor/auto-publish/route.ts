import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextVersion } from '@/lib/postUtils'
import { processArticlesData } from '@/lib/articleUtils'
import { getPostDisplayId } from '@/lib/postDisplay'

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
        votes: { select: { score: true, adminId: true } },
        originalPost: { select: { id: true, version: true } },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const isSupervisor = me.role === 'SUPERVISOR' || me.role === 'ADMIN'
    if (!isSupervisor) {
      if (!post.domainId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const expert = await prisma.domainExpert.findFirst({
        where: { userId: me.id, domainId: post.domainId },
        select: { id: true },
      })
      if (!expert) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const [superUsers, experts] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERVISOR'] } },
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
    const threshold = Math.ceil(eligibleIds.length / 2)
    const participationThreshold = threshold

    const totalScore = post.votes.reduce((sum, v) => (eligibleSet.has(v.adminId) ? sum + v.score : sum), 0)

    // شمارش مشارکت رای‌دهندگان (ادمین + ناظر)
    const participationCount = await prisma.vote.count({
      where: { postId, adminId: { in: eligibleIds } }
    })

    // بررسی رسیدن به حد نصاب مشارکت
    if (participationCount < participationThreshold) {
      return NextResponse.json({
        success: true,
        published: false,
        action: 'pending',
        message: 'مشارکت به حد نصاب نرسیده است',
        totalScore,
        threshold,
        participation: { count: participationCount, required: participationThreshold },
        needed: Math.max(0, participationThreshold - participationCount)
      })
    }

    // بررسی رسیدن به حد نصاب امتیازها
    if (Math.abs(totalScore) >= threshold) {
      if (totalScore >= threshold) {
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
                select: { version: true, domainId: true, relatedDomainIds: true },
                orderBy: { version: 'asc' },
              }),
            ])

            const parentById = new Map<string, string | null>()
            const childrenById = new Map<string, string[]>()
            const nameById = new Map<string, string>()
            for (const d of domains) {
              parentById.set(d.id, d.parentId)
              nameById.set(d.id, d.name)
              if (d.parentId) {
                const arr = childrenById.get(d.parentId) || []
                arr.push(d.id)
                childrenById.set(d.parentId, arr)
              }
            }

            const collectAncestors = (id: string): string[] => {
              const out: string[] = []
              let curId: string | null | undefined = id
              while (curId) {
                const pId: string | null = parentById.get(curId) || null
                if (!pId) break
                out.push(pId)
                curId = pId
              }
              return out
            }

            const collectDescendants = (id: string) => {
              const out: string[] = []
              const stack: string[] = [...(childrenById.get(id) || [])]
              while (stack.length) {
                const cur = stack.pop()!
                out.push(cur)
                const kids = childrenById.get(cur)
                if (kids?.length) stack.push(...kids)
              }
              return out
            }

            const expandDomainIds = (ids: string[]) => {
              const set = new Set<string>()
              for (const id of ids) {
                if (!id) continue
                set.add(id)
                for (const a of collectAncestors(id)) set.add(a)
                for (const c of collectDescendants(id)) set.add(c)
              }
              return set
            }

            const draftDomainIds = Array.from(
              new Set([post.domainId || '', ...(Array.isArray(post.relatedDomainIds) ? post.relatedDomainIds : [])].filter(Boolean))
            )
            const draftExpanded = expandDomainIds(draftDomainIds)

            let conflict: { version: number; domainId: string } | null = null
            for (const pub of publishedBetween) {
              if (pub.version == null) continue
              const pubDomainIds = Array.from(
                new Set([pub.domainId || '', ...(Array.isArray(pub.relatedDomainIds) ? pub.relatedDomainIds : [])].filter(Boolean))
              )
              if (pubDomainIds.length === 0) continue
              const pubExpanded = expandDomainIds(pubDomainIds)
              let intersects = false
              for (const id of Array.from(pubExpanded)) {
                if (draftExpanded.has(id)) {
                  intersects = true
                  break
                }
              }
              if (intersects) {
                conflict = { version: pub.version, domainId: pub.domainId || pubDomainIds[0] }
                break
              }
            }

            if (conflict) {
              await prisma.post.update({
                where: { id: postId },
                data: { status: 'REVIEWABLE' },
              })

              const domainName = nameById.get(conflict.domainId) || 'غير معروف'
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
      } else {
        // امتیاز منفی - رد طرح
        await prisma.post.update({
          where: { id: postId },
          data: { status: 'REJECTED' }
        })

        return NextResponse.json({
          success: true,
          published: true,
          action: 'rejected',
          message: 'طرح به دلیل رسیدن به حد نصاب منفی رد شد',
          totalScore,
          threshold
        })
      }
    }

    // هنوز به حد نصاب نرسیده است
    return NextResponse.json({
      success: true,
      published: false,
      action: 'pending',
      message: 'طرح هنوز به حد نصاب نرسیده است',
      totalScore,
      threshold,
      needed: threshold - Math.abs(totalScore)
    })

  } catch (error) {
    console.error('Error in auto-publish:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
