import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || (session.user?.role !== 'SUPERVISOR' && session.user?.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // شمارش تعداد ادمین‌ها و ناظرها
    const [adminCount, supervisorCount] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'SUPERVISOR' } }),
    ])

    // حد نصاب امتیاز: نصف مجموع ناظرها و ادمین‌ها
    const combinedCount = supervisorCount + adminCount
    const threshold = Math.ceil(combinedCount / 2)

    // حد نصاب مشارکت: نصف مجموع ناظرها و ادمین‌ها (همسان با حد نصاب امتیاز)
    const participationThreshold = Math.ceil(combinedCount / 2)

    return NextResponse.json({ 
      supervisorCount,
      adminCount,
      combinedCount,
      threshold,
      participationThreshold,
      success: true 
    })
  } catch (error) {
    console.error('Error getting supervisor stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}