import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const domains = await prisma.domain.findMany({
      where: {
        courses: {
          some: {
            status: 'APPROVED',
            isActive: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        courses: {
          where: {
            status: 'APPROVED',
            isActive: true,
          },
          orderBy: [{ createdAt: 'desc' }],
          select: { id: true, title: true, description: true },
        },
      },
    })

    return NextResponse.json({ domains })
  } catch (error) {
    console.error('Error fetching academy courses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
