import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getInternalVotingWeight } from '@/lib/voting-utils'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // پیدا کردن کاربر در دیتابیس
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { postId, score } = await request.json()

    console.log('Received vote data:', { postId, score, postIdType: typeof postId })

    if (!postId || typeof score !== 'number' || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Invalid data. Score must be between -2 and 2' }, { status: 400 })
    }

    // بررسی وجود پست
    const post = await prisma.post.findUnique({
      where: { id: postId }
    })

    if (!post) {
      console.log('Post not found:', postId)
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // جلوگیری از رأی‌گیری پس از انتشار یا نهایی شدن طرح
    if (['APPROVED', 'REJECTED', 'ARCHIVED'].includes(post.status)) {
      return NextResponse.json({ error: 'Voting has been stopped for this post' }, { status: 400 })
    }

    let multiplier = 1
    if (post.domainId) {
      const expert = await prisma.domainExpert.findFirst({
        where: { userId: user.id, domainId: post.domainId },
        select: { role: true, wing: true }
      })
      if (!expert) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      multiplier = getInternalVotingWeight(expert.role, expert.wing)
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const scaledMultiplier = Math.round(multiplier * 2)
    const finalScore = Math.round(score * scaledMultiplier)

    console.log('Vote attempt:', { postId, score, finalScore, adminId: user.id, postExists: !!post })

    // بررسی وجود رای قبلی
    const existingVote = await prisma.vote.findFirst({
      where: {
        postId,
        adminId: user.id,
      },
    })

    if (existingVote) {
      // به‌روزرسانی رای موجود
      await prisma.vote.update({
        where: { id: existingVote.id },
        data: { score: finalScore },
      })
      console.log('Vote updated successfully')
    } else {
      // ایجاد رای جدید
      await prisma.vote.create({
        data: {
          postId,
          adminId: user.id,
          score: finalScore,
        },
      })
      console.log('Vote created successfully')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
