import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mine = searchParams.get('mine') === 'true'

    let whereClause: any = {
      courses: {
        some: {
          status: 'APPROVED',
          isActive: true,
        },
      },
    }

    let courseWhereClause: any = {
      status: 'APPROVED',
      isActive: true,
    }

    if (mine) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      whereClause = {
        courses: {
          some: {
            status: 'APPROVED',
            isActive: true,
            userCourses: {
              some: {
                userId: session.user.id
              }
            }
          },
        },
      }

      courseWhereClause = {
        status: 'APPROVED',
        isActive: true,
        userCourses: {
          some: {
            userId: session.user.id
          }
        }
      }
    }

    const domains = await prisma.domain.findMany({
      where: whereClause,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        courses: {
          where: courseWhereClause,
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
