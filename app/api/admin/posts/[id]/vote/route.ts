import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'احراز هویت نشده' }, { status: 401 })
    }

    // بررسی اینکه کاربر ادمین است
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user || user.role !== 'ADMIN') {
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
        data: { score }
      })
    } else {
      vote = await prisma.vote.create({
        data: {
          postId: params.id,
          adminId: session.user.id,
          domainId: post.domainId || null,
          score
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

    // بررسی اینکه کاربر ادمین است
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user || user.role !== 'ADMIN') {
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