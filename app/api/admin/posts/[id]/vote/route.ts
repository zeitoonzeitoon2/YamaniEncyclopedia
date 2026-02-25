import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getInternalVotingWeight } from '@/lib/voting-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'احراز هویت نشده' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const { score } = await request.json()

    // بررسی اینکه امتیاز معتبر است
    if (![2, 1, 0, -1, -2].includes(score)) {
      return NextResponse.json({ error: 'امتیاز نامعتبر' }, { status: 400 })
    }

    // بررسی اینکه پست وجود دارد
    const post = await prisma.post.findUnique({
      where: { id: params.id }
    })

    if (!post) {
      return NextResponse.json({ error: 'پست یافت نشد' }, { status: 404 })
    }

    if (!post.domainId) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const expert = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: post.domainId },
      select: { role: true, wing: true }
    })

    if (!expert) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const multiplier = getInternalVotingWeight(expert.role, expert.wing)
    const scaledMultiplier = Math.round(multiplier * 2)
    const weightedScore = Math.round(score * scaledMultiplier)

    // ایجاد یا به‌روزرسانی رای (بدون استفاده از upsert به دلیل مشکل تایپ با فیلد اختیاری)
    const existingVote = await prisma.vote.findFirst({
      where: {
        postId: params.id,
        adminId: session.user.id,
        domainId: post.domainId || null
      }
    })

    let vote
    if (existingVote) {
      vote = await prisma.vote.update({
        where: { id: existingVote.id },
        data: { score: weightedScore }
      })
    } else {
      vote = await prisma.vote.create({
        data: {
          postId: params.id,
          adminId: session.user.id,
          domainId: post.domainId || null,
          score: weightedScore
        }
      })
    }

    return NextResponse.json({ success: true, vote })
  } catch (error) {
    console.error('Vote error:', error)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'احراز هویت نشده' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const post = await prisma.post.findUnique({
      where: { id: params.id }
    })

    if (!post?.domainId) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    const expert = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: post.domainId }
    })

    if (!expert) {
      return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
    }

    // حذف رای
    await prisma.vote.deleteMany({
      where: {
        postId: params.id,
        adminId: session.user.id
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete vote error:', error)
    return NextResponse.json({ error: 'خطای سرور' }, { status: 500 })
  }
}
