import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // آخرین نسخه تاییدشده (بر اساس بزرگ‌ترین version)
    const latest = await prisma.post.findFirst({
      where: {
        status: 'APPROVED',
        version: { not: null },
      },
      orderBy: [
        { version: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        author: { select: { name: true, image: true } },
        votes: true,
      },
    })

    return NextResponse.json(latest || null)
  } catch (error) {
    console.error('خطا در گرفتن آخرین نسخه منتشرشده:', error)
    return NextResponse.json({ error: 'خطا در گرفتن آخرین نسخه' }, { status: 500 })
  }
}