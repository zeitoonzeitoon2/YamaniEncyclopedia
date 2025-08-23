import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextVersion } from '@/lib/postUtils'
import { processArticlesData } from '@/lib/articleUtils'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { status } = await request.json()

    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    let updateData: any = { status }
    
    // اگر پست تایید می‌شود، version number اضافه کن
    if (status === 'APPROVED') {
      const existingPost = await prisma.post.findUnique({
        where: { id: params.id },
        select: { originalPostId: true }
      })
      
      if (existingPost?.originalPostId) {
        // این یک ویرایش پیشنهادی است
        // طرح قبلی را به آرشیو منتقل کن
        await prisma.post.update({
          where: { id: existingPost.originalPostId },
          data: { status: 'ARCHIVED' }
        })
        
        // برای ویرایش تاییدشده، باید ورژن جدید جهانی اختصاص یابد (نه ورژن قبلی)
        updateData.version = await generateNextVersion()
      } else {
        // این یک نمودار جدید است - version جدید تولید کن
        updateData.version = await generateNextVersion()
      }
      
      updateData.revisionNumber = null // پس از تایید، revisionNumber پاک می‌شود
    }

    const post = await prisma.post.update({
      where: { id: params.id },
      data: updateData,
      include: {
        author: {
          select: {
            name: true,
            image: true
          }
        }
      }
    })

    // اگر پست تایید شد، مقالات موجود در articlesData را پردازش و محتوای نمودار را پاکسازی کن
    if (status === 'APPROVED') {
      try {
        // در صورت وجود، ابتدا مقالات را پردازش کن
        if (post.articlesData) {
          await processArticlesData(post.articlesData, post.authorId)
        }

        // سپس محتوای نمودار را پاکسازی و لینک‌ها را نهایی کن
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
          console.warn('خطا در گردآوری extraItems drafts (ادمین-دستی):', e)
        }

        const updatedNodes = (treeData.nodes || []).map((node: any) => {
          let working: any = { ...node }

          // 1) نهایی‌سازی articleDraft اصلی -> articleLink
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
            // 2) سازگاری عقب‌رو برای draftId سطح نود
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

          // 3) نهایی‌سازی extraItems و حذف متادیتای پیش‌نویس
          if (Array.isArray(working?.data?.extraItems)) {
            const updatedItems = (working.data.extraItems as any[]).map((it: any) => {
              if (it?.type !== 'link') return it

              // اگر draft با slug داریم، لینک را به نهایی تبدیل کن و draft را حذف کن
              if (it?.draft?.slug) {
                const { draft, ...restItem } = it
                return {
                  ...restItem,
                  content: `/articles/${draft.slug}`
                }
              }

              // سازگاری عقب‌رو: draftId سطح آیتم
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
          where: { id: params.id },
          data: {
            content: JSON.stringify(updatedTreeData),
            articlesData: null,
          },
        })
      } catch (error) {
        console.error('خطا در پردازش تأیید پست:', error)
        // ادامه فرآیند تأیید حتی در صورت خطا
      }
    }

    return NextResponse.json(post)
  } catch (error) {
    console.error('Error updating post status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}