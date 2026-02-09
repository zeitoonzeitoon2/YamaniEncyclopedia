import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canExamineCourse } from '@/lib/course-utils'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const { status, score, feedback, meetLink, scheduledAt } = await req.json()

    const exam = await prisma.examSession.findUnique({
      where: { id },
      include: { course: true }
    })

    if (!exam) {
      return NextResponse.json({ error: 'Exam request not found' }, { status: 404 })
    }

    // Check permissions
    const isAuthorized = await canExamineCourse(session.user.id, exam.course.id)

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updatedExam = await prisma.$transaction(async (tx) => {
      const updated = await tx.examSession.update({
        where: { id },
        data: {
          status,
          score: score !== undefined ? score : undefined,
          feedback: feedback !== undefined ? feedback : undefined,
          meetLink: meetLink !== undefined ? meetLink : undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          examinerId: session.user.id
        }
      })

      // If passed or failed, update the enrollment status
      if (status === 'PASSED' || status === 'FAILED') {
        await tx.userCourse.update({
          where: { userId_courseId: { userId: exam.studentId, courseId: exam.courseId } },
          data: {
            status: status === 'PASSED' ? 'PASSED' : 'FAILED',
            score: score !== undefined ? score : undefined,
            examinerId: session.user.id
          }
        })
      }

      return updated
    })

    return NextResponse.json({ success: true, exam: updatedExam })
  } catch (error) {
    console.error('Error updating exam:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
