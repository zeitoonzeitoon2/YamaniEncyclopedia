import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    // Decode the slug to handle URL encoded characters
    const decodedSlug = decodeURIComponent(params.slug)
    
    const article = await prisma.article.findUnique({
      where: { slug: decodedSlug },
      include: {
        author: {
          select: { id: true, name: true, image: true }
        }
      }
    })

    if (!article) {
      return NextResponse.json({ 
        error: 'مقاله یافت نشد',
        message: 'این مقاله ممکن است یک پیش‌نویس محلی باشد که هنوز در سیستم ذخیره نشده است.'
      }, { status: 404 })
    }

    if (article.status !== 'PUBLISHED') {
      return NextResponse.json({ 
        error: 'مقاله یافت نشد',
        message: 'این مقاله هنوز منتشر نشده است.'
      }, { status: 404 })
    }

    return NextResponse.json(article)
  } catch (error) {
    console.error('خطا در دریافت مقاله:', error)
    return NextResponse.json({ error: 'خطا در دریافت مقاله' }, { status: 500 })
  }
}

// PATCH - ویرایش مقاله (ایجاد مقاله جدید)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'لطفاً وارد شوید' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { title, content, description } = body

    if (!title || !content) {
      return NextResponse.json(
        { error: 'عنوان و محتوا الزامی هستند' },
        { status: 400 }
      )
    }

    // Decode the slug to handle URL encoded characters
    const decodedSlug = decodeURIComponent(params.slug)

    // بررسی وجود مقاله و مالکیت
    const existingArticle = await prisma.article.findUnique({
      where: { slug: decodedSlug },
      select: { id: true, authorId: true }
    })

    if (!existingArticle) {
      return NextResponse.json(
        { error: 'مقاله یافت نشد' },
        { status: 404 }
      )
    }

    // Wikipedia-like model: allow any authenticated user to submit an edit
    // Ownership check removed to enable collaborative editing.

    // تولید slug یکتا از روی عنوان جدید
    const slugify = (text: string) => {
      const normalized = (text || '')
        .toLowerCase()
        .trim()
        // نرمال‌سازی کاراکترهای عربی به فارسی (ی/ک)
        .replace(/[ي]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        // حذف نیم‌فاصله و فاصله‌های خاص
        .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
      const slug = normalized
        .replace(/\s+/g, '-')
        // مجاز: حروف لاتین، اعداد، آندرلاین، خط تیره، و محدوده کامل فارسی/عربی
        .replace(/[^\w\-\u0600-\u06FF]/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+|-+$/g, '')
      return slug || 'article'
    }

    const base = slugify(title)
    let uniqueSlug = base
    let counter = 1

    // بررسی یکتا بودن و افزودن شمارنده در صورت تکراری بودن
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await prisma.article.findUnique({ where: { slug: uniqueSlug } })
      if (!exists) break
      counter += 1
      uniqueSlug = `${base}-${counter}`
    }

    // ایجاد مقاله جدید (ویرایش شده)
    const newArticle = await prisma.article.create({
      data: {
        title,
        content,
        slug: uniqueSlug,
        description,
        authorId: session.user.id,
        status: 'PUBLISHED'
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    })
    
    return NextResponse.json({
      message: 'مقاله جدید با موفقیت ایجاد شد!',
      article: newArticle,
      newSlug: uniqueSlug,
      newUrl: `/articles/${uniqueSlug}`
    })
  } catch (error) {
    console.error('خطا در ویرایش مقاله:', error)
    return NextResponse.json(
      { error: 'خطا در ویرایش مقاله' },
      { status: 500 }
    )
  }
}