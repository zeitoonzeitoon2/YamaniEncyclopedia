import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextVersion } from '@/lib/postUtils'
import { processArticlesData } from '@/lib/articleUtils'
import { calculateUserVotingWeight } from '@/lib/voting-utils'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { postId } = await request.json()

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    // دریافت تعداد ادمین‌ها و کارشناسان برای حد نصاب ترکیبی
    const [adminCount, expertCount, superUsers] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'EXPERT' } }),
      prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'EXPERT'] } },
        select: { id: true },
      })
    ])

    // دریافت پست و رای‌ها
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { votes: true, originalPost: true }
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const superUserSet = new Set(superUsers.map(u => u.id))

    let totalScore = 0
    let threshold = 0
    let participationCount = 0
    let participationThreshold = 0
    let isWeighted = false
    let participationWeight = 0

    if (post.domainId) {
      isWeighted = true
      threshold = 100
      participationThreshold = 50

      for (const v of post.votes) {
        // Only count votes from admins/experts OR experts in that domain
        // For simplicity and alignment with expert route, let's fetch experts too
        const experts = await prisma.domainExpert.findMany({
          where: { domainId: post.domainId },
          select: { userId: true }
        })
        const eligibleSet = new Set([...superUsers.map(u => u.id), ...experts.map(e => e.userId)])

        if (eligibleSet.has(v.adminId)) {
          // Use STRATEGIC mode for auto-publishing posts to account for investments
          const weight = await calculateUserVotingWeight(v.adminId, post.domainId, 'STRATEGIC')
          totalScore += v.score * weight
          participationWeight += weight
          participationCount++
        }
      }
    } else {
      threshold = Math.ceil((adminCount + expertCount) / 2)
      participationThreshold = threshold
      totalScore = post.votes.reduce((sum, vote) => sum + vote.score, 0)
      participationCount = await prisma.vote.count({ where: { postId, admin: { role: { in: ['EXPERT', 'ADMIN'] } } } })
    }

    // بررسی رسیدن به حد نصاب مشارکت
    if (isWeighted) {
      if (participationWeight < participationThreshold) {
        return NextResponse.json({
          success: true,
          published: false,
          action: 'pending',
          message: 'مشارکت (وزنی) به حد نصاب نرسیده است',
          totalScore,
          threshold,
          participation: { weight: participationWeight, required: participationThreshold },
          needed: Math.max(0, participationThreshold - participationWeight)
        })
      }
    } else {
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
    }

    // بررسی رسیدن به حد نصاب امتیازات
    if (Math.abs(totalScore) >= threshold) {
      if (totalScore >= threshold) {
        // تایید طرح
        if (post.originalPostId) {
          const [original, approvedSibling] = await prisma.$transaction([
            prisma.post.findUnique({ where: { id: post.originalPostId }, select: { status: true } }),
            prisma.post.findFirst({ where: { originalPostId: post.originalPostId, status: 'APPROVED' }, select: { id: true } })
          ])
          if ((original?.status === 'ARCHIVED') || approvedSibling) {
            await prisma.post.update({ where: { id: postId }, data: { status: 'REVIEWABLE' } })
            return NextResponse.json({
              success: true,
              action: 'reviewable',
              message: 'ویرایش شما به حد نصاب رسید اما ویرایش دیگری زودتر منتشر شده است. لطفاً ایده‌های خود را روی نسخه منتشر شده اعمال کنید.',
              totalScore,
              threshold,
              published: false,
              reviewable: true
            })
          }
        }
        const version = await generateNextVersion()

        await prisma.$transaction(async (tx) => {
          if (post.originalPostId) {
            await tx.post.update({ where: { id: post.originalPostId }, data: { status: 'ARCHIVED' } })
          }
          await tx.post.update({ where: { id: postId }, data: { status: 'APPROVED', version, revisionNumber: null } })
        })

        // پردازش داده‌های مقالات و پاکسازی
        try {
          if (post.articlesData) {
            await processArticlesData(post.articlesData, post.authorId)
          }

          const treeData = JSON.parse(post.content)

          // پاکسازی لینک‌ها و نرمال‌سازی داده‌ها مشابه مسیر ناظر
          const updatedNodes = (treeData.nodes || []).map((node: any) => {
            let working: any = { ...node }
            if (working?.data?.articleDraft) {
              const { articleDraft, draftId, ...restData } = working.data
              working = { ...working, data: { ...restData, articleLink: `/articles/${articleDraft.slug}` } }
            } else if (working?.data?.draftId) {
              const raw = String(working.data.draftId || '')
              let path = raw.trim()
              try { if (/^https?:\/\//i.test(path)) { const u = new URL(path); path = u.pathname } } catch {}
              path = path.split('?')[0].split('#')[0]
              path = path.replace(/^\/?/, '/')
              const slug = path.replace(/^\/?articles\//, '').replace(/\/+$/g, '')
              const finalLink = slug ? `/articles/${slug}` : (working.data.articleLink || '')
              const { draftId, ...restData } = working.data
              working = { ...working, data: { ...restData, articleLink: finalLink } }
            }
            if (Array.isArray(working?.data?.extraItems)) {
              const updatedItems = (working.data.extraItems as any[]).map((it: any) => {
                if (it?.type !== 'link') return it
                if (it?.draft?.slug) { const { draft, ...restItem } = it; return { ...restItem, content: `/articles/${draft.slug}` } }
                if (it?.draftId) {
                  let path = String(it.draftId).trim()
                  try { if (/^https?:\/\//i.test(path)) { const u = new URL(path); path = u.pathname } } catch {}
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
              working = { ...working, data: { ...(working.data || {}), extraItems: updatedItems, extraTexts, extraLinks } }
            }
            return working
          })
          const updatedTreeData = { ...treeData, nodes: updatedNodes }
          await prisma.post.update({ where: { id: postId }, data: { content: JSON.stringify(updatedTreeData), articlesData: null } })
        } catch (error) {
          console.error('خطا در پاکسازی/انتشار مقالات پس از تایید (ادمین):', error)
        }

        return NextResponse.json({ 
          success: true,
          action: 'approved',
          message: 'طرح به دلیل رسیدن به حد نصاب مثبت تایید شد',
          totalScore,
          threshold
        })
      } else {
        // رد طرح
        await prisma.post.update({ where: { id: postId }, data: { status: 'REJECTED' } })
        return NextResponse.json({ success: true, action: 'rejected', message: 'طرح به دلیل رسیدن به حد نصاب منفی رد شد', totalScore, threshold })
      }
    }

    return NextResponse.json({ success: true, action: 'pending', message: 'طرح هنوز به حد نصاب نرسیده است', totalScore, threshold, needed: threshold - Math.abs(totalScore) })

  } catch (error) {
    console.error('Error in auto-publish:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}