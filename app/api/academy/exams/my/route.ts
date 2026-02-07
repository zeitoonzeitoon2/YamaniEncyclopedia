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
        select: {
          id: true,
          status: true,
          studentId: true,
          examinerId: true,
          courseId: true,
          scheduledAt: true,
          meetLink: true,
          createdAt: true,
          course: {
            select: {
              id: true,
              title: true,
              domain: {
                select: {
                  experts: {
                    select: {
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
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          examiner: {
            select: {
              id: true,
              name: true,
              image: true
            }
          },
          chatMessages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              createdAt: true,
              sender: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.userCourse.findMany({
        where: { userId: session.user.id },
        select: {
          createdAt: true,
          courseId: true,
          course: {
            select: {
              id: true,
              title: true,
              domain: {
                select: {
                  experts: {
                    select: {
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
        examinerId: null,
        scheduledAt: null,
        meetLink: null,
        courseId: enrollment.courseId,
        course: enrollment.course,
        student: { 
          id: session.user.id, 
          name: session.user.name || null, 
          email: session.user.email || null,
          image: (session.user as any).image || null
        },
        examiner: null,
        createdAt: enrollment.createdAt,
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
