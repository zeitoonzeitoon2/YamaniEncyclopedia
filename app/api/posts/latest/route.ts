import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    // آخرین نسخه تاییدشده (بر اساس بزرگ‌ترین version)
    const latest = await prisma.post.findFirst({
      where: {
        status: 'APPROVED',
        type: 'TREE',
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

    return NextResponse.json(latest || null, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    console.error('خطا در گرفتن آخرین نسخه منتشرشده:', error)
    return NextResponse.json({ error: 'خطا در گرفتن آخرین نسخه' }, { status: 500 })
  }
}
