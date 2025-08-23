import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // گرفتن تمام پست‌های منتشر شده با رای‌هایشان
    const posts = await prisma.post.findMany({
      where: {
        status: 'APPROVED',
        version: { not: null } // فقط پست‌های منتشر شده
      },
      include: {
        author: {
          select: {
            name: true,
            image: true
          }
        },
        votes: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // محاسبه امتیاز هر پست و فیلتر کردن پست‌هایی که حداقل یک رای دارند
    const postsWithScores = posts
      .filter(post => post.votes.length > 0) // فقط پست‌هایی که رای دارند
      .map(post => {
        const totalScore = post.votes.reduce((sum, vote) => sum + vote.score, 0)
        return {
          ...post,
          totalScore
        }
      })
      .filter(post => post.totalScore > 0) // فقط پست‌هایی با امتیاز مثبت

    // مرتب‌سازی بر اساس امتیاز و انتخاب بالاترین
    let topPost = postsWithScores.sort((a, b) => b.totalScore - a.totalScore)[0]

    // اگر پست با رای مثبت وجود ندارد، آخرین پست APPROVED را به عنوانfallback برگردان
    if (!topPost && posts.length > 0) {
      topPost = posts[0]
    }
    
    return NextResponse.json(topPost || null)
  } catch (error) {
    console.error('خطا در گرفتن نمودار اصلی:', error)
    return NextResponse.json(
      { error: 'خطا در گرفتن نمودار اصلی' },
      { status: 500 }
    )
  }
}