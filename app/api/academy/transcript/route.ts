import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const transcript = await prisma.userCourse.findMany({
      where: {
        userId: session.user.id,
        status: 'PASSED'
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            domain: { select: { name: true } }
          }
        },
        examiner: {
          select: { name: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({ transcript })
  } catch (error) {
    console.error('Error fetching transcript:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
