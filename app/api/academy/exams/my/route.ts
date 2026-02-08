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
              id: true,
              content: true,
              createdAt: true,
              sender: {
                select: {
                  id: true,
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
          courseId: true
        }
      })
    ])

    const courseIds = Array.from(new Set(
      [
        ...exams.map(exam => exam.courseId),
        ...enrollments.map(enrollment => enrollment.courseId)
      ].filter((id): id is string => Boolean(id))
    ))

    const courses = courseIds.length > 0
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true, domainId: true }
        })
      : []

    const courseById = new Map(courses.map(course => [course.id, course]))

    const domainIds = Array.from(new Set(
      courses.map(course => course.domainId).filter((id): id is string => Boolean(id))
    ))

    const domains = domainIds.length > 0
      ? await prisma.domain.findMany({
          where: { id: { in: domainIds } },
          select: { id: true, parentId: true }
        })
      : []

    const parentIds = Array.from(new Set(domains.map(d => d.parentId).filter((id): id is string => Boolean(id))))
    const expertDomainIds = Array.from(new Set([...domainIds, ...parentIds].filter((id): id is string => Boolean(id))))

    const domainExperts = expertDomainIds.length > 0
      ? await prisma.domainExpert.findMany({
          where: { domainId: { in: expertDomainIds } },
          select: {
            id: true,
            role: true,
            domainId: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true
              }
            }
          }
        })
      : []

    const expertsByDomainId = new Map<string, typeof domainExperts>()
    for (const expert of domainExperts) {
      const list = expertsByDomainId.get(expert.domainId)
      if (list) list.push(expert)
      else expertsByDomainId.set(expert.domainId, [expert])
    }

    const parentIdByDomainId = new Map(domains.map(d => [d.id, d.parentId]))

    const enrichCourse = (courseId: string) => {
      const course = courseById.get(courseId)
      const domainId = course?.domainId || null
      const parentId = domainId ? parentIdByDomainId.get(domainId) ?? null : null
      return {
        id: course?.id || courseId,
        title: course?.title || '---',
        domain: {
          experts: domainId ? (expertsByDomainId.get(domainId) || []) : [],
          parent: {
            experts: parentId ? (expertsByDomainId.get(parentId) || []) : []
          }
        }
      }
    }

    const normalizedExams = exams.map(exam => ({
      ...exam,
      course: enrichCourse(exam.courseId)
    }))

    const virtualExams = enrollments
      .filter(enrollment => !exams.some(exam => exam.courseId === enrollment.courseId))
      .map(enrollment => ({
        id: `course-${enrollment.courseId}`,
        status: 'ENROLLED',
        studentId: session.user.id,
        examinerId: null,
        scheduledAt: null,
        meetLink: null,
        courseId: enrollment.courseId,
        course: enrichCourse(enrollment.courseId),
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

    const allExams = [...normalizedExams, ...virtualExams].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return NextResponse.json({ exams: allExams })
  } catch (error) {
    console.error('Error fetching my exams:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
