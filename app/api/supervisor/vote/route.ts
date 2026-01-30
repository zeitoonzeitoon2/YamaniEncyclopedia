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

    const isSupervisor = user.role === 'SUPERVISOR' || user.role === 'ADMIN'
    if (!isSupervisor) {
      if (!post.domainId) {
        return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
      }
      const expert = await prisma.domainExpert.findFirst({
        where: { userId: user.id, domainId: post.domainId },
        select: { id: true },
      })
      if (!expert) {
        return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })
      }
    }

    const vote = await prisma.vote.upsert({
      where: {
        postId_adminId: {
          postId,
          adminId: user.id
        }
      },
      update: { score },
      create: { postId, adminId: user.id, score }
    })

    return NextResponse.json({ success: true, vote })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
