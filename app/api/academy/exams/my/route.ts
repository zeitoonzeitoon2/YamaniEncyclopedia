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

    const exams = await prisma.examSession.findMany({
      where: {
        OR: [
          { studentId: session.user.id },
          { examinerId: session.user.id }
        ]
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            domain: {
              select: {
                experts: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        name: true,
                        image: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        student: { select: { id: true, name: true, email: true } },
        examiner: { select: { id: true, name: true } },
        chatMessages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ exams })
  } catch (error) {
    console.error('Error fetching my exams:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
