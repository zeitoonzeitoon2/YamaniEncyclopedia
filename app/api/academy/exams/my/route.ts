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

    console.log('[DEBUG] Fetching exams for user:', session.user.id)
    let exams: any[] = []
    try {
      exams = await prisma.examSession.findMany({
        where: {
          OR: [
            { studentId: session.user.id },
            { examinerId: session.user.id }
          ]
        },
        include: {
          student: { select: { id: true, name: true, email: true, image: true } },
          examiner: { select: { id: true, name: true, image: true } },
          course: {
            include: {
              domain: {
                include: {
                  parent: true,
                  experts: {
                    include: {
                      user: { select: { id: true, name: true, image: true } }
                    }
                  }
                }
              }
            }
          },
          chatMessages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: { select: { id: true, name: true, image: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    } catch (e: any) {
      console.error('[DEBUG] Error fetching exams:', e)
      throw new Error(`Exams fetch failed: ${e.message}`)
    }

    console.log('[DEBUG] Fetching enrollments for user:', session.user.id)
    let enrollments: any[] = []
    try {
      enrollments = await prisma.userCourse.findMany({
        where: { userId: session.user.id },
        include: {
          course: {
            include: {
              domain: {
                include: {
                  parent: true,
                  experts: {
                    include: {
                      user: { select: { id: true, name: true, image: true } }
                    }
                  }
                }
              }
            }
          }
        }
      })
    } catch (e: any) {
      console.error('[DEBUG] Error fetching enrollments:', e)
      throw new Error(`Enrollments fetch failed: ${e.message}`)
    }

    console.log(`[DEBUG] Found ${exams.length} exams and ${enrollments.length} enrollments`)

    // 3. We also need experts for parent domains
    const parentDomainIds = new Set<string>()
    exams.forEach(e => {
      if (e.course?.domain?.parent?.id) parentDomainIds.add(e.course.domain.parent.id)
    })
    enrollments.forEach(e => {
      if (e.course?.domain?.parent?.id) parentDomainIds.add(e.course.domain.parent.id)
    })

    console.log('[DEBUG] Parent domain IDs:', Array.from(parentDomainIds))

    let parentExperts: any[] = []
    if (parentDomainIds.size > 0) {
      try {
        parentExperts = await prisma.domainExpert.findMany({
          where: { domainId: { in: Array.from(parentDomainIds) } },
          include: {
            user: { select: { id: true, name: true, image: true } }
          }
        })
      } catch (e: any) {
        console.error('[DEBUG] Error fetching parent experts:', e)
        // Non-critical, just log it
      }
    }

    const parentExpertsByDomainId = new Map<string, any[]>()
    parentExperts.forEach(pe => {
      const list = parentExpertsByDomainId.get(pe.domainId) || []
      list.push(pe)
      parentExpertsByDomainId.set(pe.domainId, list)
    })

    // 4. Transform data with safety checks
    const enrichDomain = (domain: any) => {
      if (!domain) return null
      const parentId = domain.parent?.id
      return {
        ...domain,
        experts: domain.experts || [],
        parent: domain.parent ? {
          ...domain.parent,
          experts: parentId ? (parentExpertsByDomainId.get(parentId) || []) : []
        } : null
      }
    }

    console.log('[DEBUG] Normalizing exams')
    const normalizedExams = exams.map(exam => {
      try {
        return {
          ...exam,
          course: exam.course ? {
            ...exam.course,
            domain: enrichDomain(exam.course.domain)
          } : null
        }
      } catch (e) {
        console.error('[DEBUG] Error normalizing exam:', exam.id, e)
        return null
      }
    }).filter(Boolean)

    console.log('[DEBUG] Generating virtual exams')
    const virtualExams = enrollments
      .filter(enrollment => enrollment.courseId && !exams.some(exam => exam.courseId === enrollment.courseId))
      .map(enrollment => {
        try {
          return {
            id: `course-${enrollment.courseId}`,
            status: 'ENROLLED',
            studentId: session.user.id,
            examinerId: null,
            scheduledAt: null,
            meetLink: null,
            courseId: enrollment.courseId,
            course: enrollment.course ? {
              ...enrollment.course,
              domain: enrichDomain(enrollment.course.domain)
            } : null,
            student: { 
              id: session.user.id, 
              name: session.user.name || null, 
              email: session.user.email || null,
              image: (session.user as any)?.image || (session.user as any)?.picture || null
            },
            examiner: null,
            createdAt: enrollment.createdAt || new Date().toISOString(),
            chatMessages: []
          }
        } catch (e) {
          console.error('[DEBUG] Error generating virtual exam for enrollment:', enrollment.courseId, e)
          return null
        }
      }).filter(Boolean)

    console.log('[DEBUG] Sorting all exams')
    const allExams = [...normalizedExams, ...virtualExams].sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })

    // 5. Final serialization check - ensure everything is a plain object
    const finalResult = JSON.parse(JSON.stringify({ exams: allExams }))
    return NextResponse.json(finalResult)
  } catch (error: any) {
    console.error('Error fetching my exams:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: error.stack 
    }, { status: 500 })
  }
}
