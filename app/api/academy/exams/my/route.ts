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

    const [exams, enrollments] = await Promise.all([
      prisma.examSession.findMany({
        where: {
          OR: [
            { studentId: session.user.id },
            { examinerId: session.user.id }
          ]
        },
        include: {
          course: {
            include: {
              domain: {
                include: {
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
      }),
      prisma.userCourse.findMany({
        where: { userId: session.user.id },
        include: {
          course: {
            include: {
              domain: {
                include: {
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
          }
        }
      })
    ])

    // Create "virtual" exam sessions for courses without one
    const virtualExams = enrollments
      .filter(enrollment => !exams.some(exam => exam.courseId === enrollment.courseId))
      .map(enrollment => ({
        id: `course-${enrollment.courseId}`, // Virtual ID
        status: 'ENROLLED',
        studentId: session.user.id,
        courseId: enrollment.courseId,
        course: enrollment.course,
        student: { id: session.user.id, name: session.user.name, email: session.user.email },
        createdAt: enrollment.createdAt || new Date().toISOString(),
        chatMessages: []
      }))

    const allExams = [...exams, ...virtualExams].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return NextResponse.json({ exams: allExams })
  } catch (error) {
    console.error('Error fetching my exams:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
