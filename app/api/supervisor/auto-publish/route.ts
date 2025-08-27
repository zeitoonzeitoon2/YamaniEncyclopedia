import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextVersion } from '@/lib/postUtils'
import { processArticlesData } from '@/lib/articleUtils'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || (session.user?.role !== 'SUPERVISOR' && session.user?.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId } = await request.json()

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    // شمارش تعداد ادمین‌ها و ناظرها
    const [adminCount, supervisorCount] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'SUPERVISOR' } })
    ])

    // حد نصاب امتیاز بر اساس نصف مجموع ادمین + ناظر
    const threshold = Math.ceil((supervisorCount + adminCount) / 2)

    // حد نصاب مشارکت: نصف مجموع ادمین + ناظر (همسان با حد نصاب امتیاز)
    const participationThreshold = Math.ceil((supervisorCount + adminCount) / 2)
    
    // دریافت پست و رای‌ها
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        votes: true,
        originalPost: true
      }
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // محاسبه مجموع امتیازها
    const totalScore = post.votes.reduce((sum, vote) => sum + vote.score, 0)

    // شمارش مشارکت رای‌دهندگان (ادمین + ناظر)
    const participationCount = await prisma.vote.count({
      where: { postId, admin: { role: { in: ['SUPERVISOR', 'ADMIN'] } } }
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
        // اگر ویرایش دیگری قبلا منتشر شده، این ویرایش را فقط «قابل بررسی» کن
        if (post.originalPostId) {
          const approvedSibling = await prisma.post.findFirst({
            where: { originalPostId: post.originalPostId, status: 'APPROVED' },
            select: { id: true }
          })
          if (approvedSibling) {
            await prisma.post.update({
              where: { id: postId },
              data: { status: 'REVIEWABLE' }
            })
            return NextResponse.json({
              success: true,
              published: false,
              action: 'reviewable',
              message: 'ویرایش شما به حد نصاب رسید اما ویرایش دیگری زودتر منتشر شده است. لطفاً ایده‌های خود را روی نسخه منتشر شده اعمال کنید.',
              totalScore,
              threshold,
              reviewable: true
            })
          }
        }
        let version: number | null = null

        if (post.originalPostId) {
          // ویرایش پیشنهادی است: طرح قبلی را آرشیو کن
          await prisma.post.update({
            where: { id: post.originalPostId },
            data: { status: 'ARCHIVED' }
          })
          // اختصاص ورژن جدید
          version = await generateNextVersion()
        } else {
          // نمودار جدید: تولید ورژن جدید
          version = await generateNextVersion()
        }

        await prisma.post.update({
          where: { id: postId },
          data: {
            status: 'APPROVED',
            version: version,
            revisionNumber: null
          }
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