import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // شمارش تعداد ادمین‌ها
    const adminCount = await prisma.user.count({
      where: {
        role: 'ADMIN'
      }
    })

    // محاسبه حد نصاب (نصف تعداد ادمین‌ها)
    const threshold = Math.ceil(adminCount / 2)

    return NextResponse.json({ 
      adminCount,
      threshold,
      success: true 
    })
  } catch (error) {
    console.error('Error getting admin stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}