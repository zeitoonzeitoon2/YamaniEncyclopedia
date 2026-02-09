import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'pending' // pending or history

    // Find domains where the user is an expert
    const expertDomains = await prisma.domainExpert.findMany({
      where: { userId: session.user.id },
      select: { domainId: true }
    })

    const domainIds = expertDomains.map(d => d.domainId)

    // Find courses where the user has passed all TEACH prerequisites
    const allTeachPrereqs = await prisma.coursePrerequisite.findMany({
      where: { type: 'TEACH', status: 'APPROVED' },
      select: { courseId: true, prerequisiteCourseId: true }
    })

    const passedCourses = await prisma.userCourse.findMany({
      where: { userId: session.user.id, status: 'PASSED' },
      select: { courseId: true }
    })
    const passedCourseIds = new Set(passedCourses.map(p => p.courseId))

    const coursesWithTeachPrereqs = new Set(allTeachPrereqs.map(p => p.courseId))
    const qualifiedCourseIds = Array.from(coursesWithTeachPrereqs).filter(courseId => {
      const prereqsForCourse = allTeachPrereqs.filter(p => p.courseId === courseId)
      return prereqsForCourse.every(p => passedCourseIds.has(p.prerequisiteCourseId))
    })

    if (domainIds.length === 0 && qualifiedCourseIds.length === 0 && session.user.role !== 'ADMIN') {
      return NextResponse.json({ exams: [] })
    }

    const exams = await prisma.examSession.findMany({
      where: {
        course: session.user.role === 'ADMIN' ? {} : {
          OR: [
            { domainId: { in: domainIds } },
            { id: { in: qualifiedCourseIds } }
          ]
        },
        status: type === 'pending' ? { in: ['REQUESTED', 'SCHEDULED'] } : { in: ['PASSED', 'FAILED'] }
      },
      include: {
        course: { select: { title: true } },
        student: { select: { name: true, email: true } },
        examiner: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ exams })
  } catch (error) {
    console.error('Error fetching exams:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
