import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'احراز هویت نشده' }, { status: 401 })
    }

    // پیدا کردن کاربر در دیتابیس
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const { postId, score } = await request.json()

    if (!postId || ![2, 1, 0, -1, -2].includes(score)) {
      return NextResponse.json({ error: 'داده نامعتبر' }, { status: 400 })
    }

    // بررسی وجود پست
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, domainId: true },
    })
    if (!post) {
      return NextResponse.json({ error: 'پست یافت نشد' }, { status: 404 })
    }
    // جلوگیری از رأی‌گیری پس از انتشار یا نهایی شدن طرح
    if (['APPROVED', 'REJECTED', 'ARCHIVED'].includes(post.status)) {
      return NextResponse.json({ error: 'نظرسنجی این طرح متوقف شده است' }, { status: 400 })
    }

    let multiplier = 1
    const isGlobalExpert = user.role === 'EXPERT' || user.role === 'ADMIN'

    // Check domain expertise and HEAD role
    if (post.domainId) {
      const expert = await prisma.domainExpert.findFirst({
        where: { userId: user.id, domainId: post.domainId },
        select: { id: true, role: true },
      })
      
      if (expert) {
        if (expert.role === 'HEAD') {
          multiplier = 2
        }
      } else if (!isGlobalExpert) {
        // Not a global expert/admin and not a domain expert
        return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
      }
    } else if (!isGlobalExpert) {
      // No domain, and not global expert
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    // Calculate final score based on direction and multiplier
    // Preserve 0 as 0
    let finalScore = score
    if (score !== 0) {
      const direction = score > 0 ? 1 : -1
      // If the input was a "strong" vote (2/-2), we keep that intensity, 
      // AND apply the HEAD multiplier? 
      // User said "Head has 2x voting power". 
      // If Expert votes 1 -> 1. Head votes 1 -> 2.
      // If Expert votes 2 -> 2. Head votes 2 -> 4.
      // So we multiply the input score by the multiplier.
      finalScore = score * multiplier
    }

    const vote = await prisma.vote.upsert({
      where: {
        postId_adminId: {
          postId,
          adminId: user.id
        }
      },
      update: { score: finalScore },
      create: { postId, adminId: user.id, score: finalScore }
    })

    return NextResponse.json({ success: true, vote })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
