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

    const { postId, score, domainId } = await request.json()

    if (!postId || ![2, 1, 0, -1, -2].includes(score)) {
      return NextResponse.json({ error: 'داده نامعتبر' }, { status: 400 })
    }

    // بررسی وجود پست
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, domainId: true, relatedDomainIds: true },
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
    const targetDomainId = domainId || post.domainId
    
    if (targetDomainId) {
      // If specific domain vote, user must be expert in that domain OR global expert
      // Actually, for multi-domain, only experts of that domain should vote?
      // User said: "if a proposal changes two domains... two separate votes between two separate teams"
      // So global expert might not have a say unless they are expert in that domain?
      // Assuming global expert (ADMIN) can always vote.
      
      const expert = await prisma.domainExpert.findFirst({
        where: { userId: user.id, domainId: targetDomainId },
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

    const voteDomainId = domainId || post.domainId || null

    const existingVote = await prisma.vote.findFirst({
      where: {
        postId,
        adminId: user.id,
        domainId: voteDomainId
      }
    })

    let vote
    if (existingVote) {
      vote = await prisma.vote.update({
        where: { id: existingVote.id },
        data: { score: finalScore }
      })
    } else {
      vote = await prisma.vote.create({
        data: {
          postId,
          adminId: user.id,
          domainId: voteDomainId,
          score: finalScore
        }
      })
    }

    return NextResponse.json({ success: true, vote })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
