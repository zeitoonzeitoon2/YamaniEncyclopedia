import { prisma } from '@/lib/prisma'

// تولید slug یکتا از روی عنوان
const slugify = (text: string) => {
  const normalized = (text || '')
    .toLowerCase()
    .trim()
    // نرمال‌سازی کاراکترهای عربی به فارسی
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    // حذف نیم‌فاصله و کنترل‌های bidi
    .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
  const slug = normalized
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u0600-\u06FF]/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'article'
}

// پیدا کردن slug یکتا
export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title)
  let uniqueSlug = base
  let counter = 1

  // بررسی یکتا بودن و افزودن شمارنده در صورت تکراری بودن
  while (true) {
    const exists = await prisma.article.findUnique({ where: { slug: uniqueSlug } })
    if (!exists) break
    counter += 1
    uniqueSlug = `${base}-${counter}`
  }

  return uniqueSlug
}

// نوع پیش‌نویس مقاله
interface ArticleDraft {
  title: string
  content: string
  description?: string
  slug?: string
  nodeId?: string
  nodeLabel?: string
}

// ساختار articlesData 
interface ArticlesData {
  version: string
  type: string
  drafts: ArticleDraft[]
}

// پردازش articlesData و ایجاد/به‌روزرسانی مقالات
export async function processArticlesData(
  articlesDataString: string | null | undefined,
  authorId: string
): Promise<void> {
  if (!articlesDataString) {
    console.log('هیچ داده مقاله‌ای برای پردازش یافت نشد')
    return
  }

  try {
    const articlesData: ArticlesData = JSON.parse(articlesDataString)
    
    if (!articlesData.drafts || !Array.isArray(articlesData.drafts)) {
      console.log('ساختار نامعتبر articlesData: فیلد drafts یافت نشد')
      return
    }

    console.log(`پردازش ${articlesData.drafts.length} پیش‌نویس مقاله`)

    for (const draft of articlesData.drafts) {
      if (!draft.title || !draft.content) {
        console.log('پیش‌نویس نامعتبر: فیلد title یا content خالی است')
        continue
      }

      // بررسی وجود مقاله با slug مشابه
      let existingArticle = null
      if (draft.slug) {
        existingArticle = await prisma.article.findUnique({
          where: { slug: draft.slug }
        })
      }

      if (existingArticle) {
        // به‌روزرسانی مقاله موجود
        await prisma.article.update({
          where: { id: existingArticle.id },
          data: {
            title: draft.title,
            content: draft.content,
            description: draft.description || existingArticle.description,
            status: 'PUBLISHED',
            updatedAt: new Date()
          }
        })
        console.log(`مقاله به‌روزرسانی شد: ${draft.title} (slug: ${draft.slug})`)
      } else {
        // ایجاد مقاله جدید
        const uniqueSlug = draft.slug || await generateUniqueSlug(draft.title)
        
        await prisma.article.create({
          data: {
            title: draft.title,
            content: draft.content,
            slug: uniqueSlug,
            description: draft.description,
            authorId: authorId,
            status: 'PUBLISHED'
          }
        })
        console.log(`مقاله جدید ایجاد شد: ${draft.title} (slug: ${uniqueSlug})`)
      }
    }
  } catch (error) {
    console.error('خطا در پردازش articlesData:', error)
    throw error
  }
}