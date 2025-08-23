import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - دریافت تمام مقاله‌های منتشر شده
export async function GET() {
  try {
    const articles = await prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(articles)
  } catch (error) {
    console.error('خطا در دریافت مقاله‌ها:', error)
    return NextResponse.json(
      { error: 'خطا در دریافت مقاله‌ها' },
      { status: 500 }
    )
  }
}

// POST - ایجاد مقاله جدید
export async function POST(request: NextRequest) {
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

    // تولید slug یکتا از روی عنوان در سمت سرور
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
    // محدودیت منطقی برای جلوگیری از حلقه بی‌نهایت
    // (در عمل به اولین گزینه یکتا می‌رسد)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await prisma.article.findUnique({ where: { slug: uniqueSlug } })
      if (!exists) break
      counter += 1
      uniqueSlug = `${base}-${counter}`
    }

    const article = await prisma.article.create({
      data: {
        title,
        content,
        slug: uniqueSlug,
        description,
        authorId: session.user.id,
        status: 'PUBLISHED' // یا DRAFT برای پیش‌نویس
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

    return NextResponse.json(article, { status: 201 })
  } catch (error) {
    console.error('خطا در ایجاد مقاله:', error)
    return NextResponse.json(
      { error: 'خطا در ایجاد مقاله' },
      { status: 500 }
    )
  }
}