import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || (session.user?.role !== 'EXPERT' && session.user?.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // شمارش تعداد ادمین‌ها و کارشناسان
    const [adminCount, expertCount] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'EXPERT' } }),
    ])

    // حد نصاب امتیاز: نصف مجموع کارشناسان و ادمین‌ها
    const combinedCount = expertCount + adminCount
    const threshold = Math.ceil(combinedCount / 2)

    // حد نصاب مشارکت: نصف مجموع کارشناسان و ادمین‌ها (همسان با حد نصاب امتیاز)
    const participationThreshold = Math.ceil(combinedCount / 2)

    return NextResponse.json({ 
      expertCount,
      adminCount,
      combinedCount,
      threshold,
      participationThreshold,
      success: true 
    })
  } catch (error) {
    console.error('Error getting expert stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
