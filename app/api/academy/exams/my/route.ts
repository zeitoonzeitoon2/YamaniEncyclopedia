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

    const userId = session.user.id
    console.log(`[DEBUG] Starting optimized fetch for user: ${userId}`)

    // 0. Check if user is an expert or qualified examiner
    const myExpertDomains = await prisma.domainExpert.findMany({
      where: { userId },
      select: { domainId: true }
    })
    const myExpertDomainIds = myExpertDomains.map(d => d.domainId)

    // Find courses where the user has passed all TEACH prerequisites
    const allTeachPrereqs = await prisma.coursePrerequisite.findMany({
      where: { type: 'TEACH', status: 'APPROVED' },
      select: { courseId: true, prerequisiteCourseId: true }
    })

    const passedCourses = await prisma.userCourse.findMany({
      where: { userId, status: 'PASSED' },
      select: { courseId: true }
    })
    const passedCourseIds = new Set(passedCourses.map(p => p.courseId))

    const coursesWithTeachPrereqs = new Set(allTeachPrereqs.map(p => p.courseId))
    const qualifiedCourseIds = Array.from(coursesWithTeachPrereqs).filter(courseId => {
      const prereqsForCourse = allTeachPrereqs.filter(p => p.courseId === courseId)
      return prereqsForCourse.every(p => passedCourseIds.has(p.prerequisiteCourseId))
    })

    const isExpert = myExpertDomainIds.length > 0
    const isQualifiedExaminer = qualifiedCourseIds.length > 0
    const canExamineAny = isExpert || isQualifiedExaminer

    // 1. Fetch Exam Sessions (Flat)
    let rawExams: any[] = []
    const examinerQuery = [
      ...(isExpert ? [{ course: { domainId: { in: myExpertDomainIds } } }] : []),
      ...(isQualifiedExaminer ? [{ courseId: { in: qualifiedCourseIds } }] : [])
    ]

    try {
      rawExams = await prisma.examSession.findMany({
        where: {
          OR: [
            { studentId: userId }, 
            { examinerId: userId },
            ...examinerQuery
          ]
        },
        include: {
          student: { select: { id: true, name: true, email: true, image: true } },
          examiner: { select: { id: true, name: true, image: true } },
          course: { select: { id: true, title: true, domainId: true } },
          chatMessages: {
            include: {
              sender: { select: { id: true, name: true, image: true } }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    } catch (error: any) {
      console.error('[DEBUG] Failed to fetch with chatMessages, trying without:', error.message)
      rawExams = await prisma.examSession.findMany({
        where: {
          OR: [
            { studentId: userId }, 
            { examinerId: userId },
            ...examinerQuery
          ]
        },
        include: {
          student: { select: { id: true, name: true, email: true, image: true } },
          examiner: { select: { id: true, name: true, image: true } },
          course: { select: { id: true, title: true, domainId: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    }

    let rawEnrollments: any[] = []
    
    if (canExamineAny) {
      // Fetch all enrollments in courses belonging to domains I manage OR courses I'm qualified to examine
      const allEnrollments = await prisma.userCourse.findMany({
        where: {
          OR: [
            { course: { domainId: { in: myExpertDomainIds } } },
            { courseId: { in: qualifiedCourseIds } }
          ]
        },
        include: {
          course: { select: { id: true, title: true, domainId: true } },
          user: { select: { id: true, name: true, email: true, image: true } }
        }
      })

      // Filter out students who have already passed this course
      const passedSessions = await prisma.examSession.findMany({
        where: {
          courseId: { in: allEnrollments.map(en => en.courseId) },
          status: 'PASSED'
        },
        select: { studentId: true, courseId: true }
      })

      rawEnrollments = allEnrollments.filter(en => 
        !passedSessions.some(ps => ps.studentId === en.userId && ps.courseId === en.courseId)
      )
    } else {
      // Standard student view: only their own enrollments
      rawEnrollments = await prisma.userCourse.findMany({
        where: { userId },
        include: {
          course: { select: { id: true, title: true, domainId: true } }
        }
      })
    }

    // 3. Collect all unique Domain IDs to fetch their experts
    const domainIds = new Set<string>()
    rawExams.forEach(e => { if (e.course?.domainId) domainIds.add(e.course.domainId) })
    rawEnrollments.forEach(e => { if (e.course?.domainId) domainIds.add(e.course.domainId) })

    // 4. Fetch Domains with their parent IDs
    const domains = await prisma.domain.findMany({
      where: { id: { in: Array.from(domainIds) } },
      select: { id: true, name: true, parentId: true }
    })

    // Add parent IDs to our set
    domains.forEach(d => { if (d.parentId) domainIds.add(d.parentId) })

    // 5. Fetch all Experts for all relevant domains in one go
    const allExperts = await prisma.domainExpert.findMany({
      where: { domainId: { in: Array.from(domainIds) } },
      include: {
        user: { select: { id: true, name: true, image: true } }
      }
    })

    // Group experts by domainId
    const expertsByDomain = new Map<string, any[]>()
    allExperts.forEach(expert => {
      const list = expertsByDomain.get(expert.domainId) || []
      list.push(expert)
      expertsByDomain.set(expert.domainId, list)
    })

    // 6. Map domains to their full structure (including parent experts)
    const domainMap = new Map<string, any>()
    domains.forEach(d => {
      domainMap.set(d.id, {
        id: d.id,
        name: d.name,
        experts: expertsByDomain.get(d.id) || [],
        parent: d.parentId ? {
          id: d.parentId,
          experts: expertsByDomain.get(d.parentId) || []
        } : null
      })
    })

    // 7. Assemble Normalized Exams
    const normalizedExams = rawExams.map(exam => ({
      ...exam,
      chatMessages: exam.chatMessages || [], // Ensure this property exists
      course: exam.course ? {
        ...exam.course,
        domain: domainMap.get(exam.course.domainId) || { id: exam.course.domainId, experts: [] }
      } : null
    }))

    // 8. Assemble Virtual Exams from Enrollments
    const virtualExams = rawEnrollments
      .filter(en => {
        // For students: check if they already have an exam session for this course
        if (!canExamineAny) return !rawExams.some(ex => ex.courseId === en.courseId)
        
        // For examiners: show the enrollment as a virtual session for THIS student
        // unless there's already a real session between this examiner and this student for this course
        return !rawExams.some(ex => ex.courseId === en.courseId && ex.studentId === en.userId)
      })
      .map(en => ({
        id: `course-${en.courseId}-${en.userId}`, // Unique ID for virtual session
        status: 'ENROLLED',
        studentId: en.userId,
        examinerId: canExamineAny ? userId : null,
        scheduledAt: null,
        meetLink: null,
        courseId: en.courseId,
        course: en.course ? {
          ...en.course,
          domain: domainMap.get(en.course.domainId) || { id: en.course.domainId, experts: [] }
        } : null,
        student: en.user || { 
          id: userId, 
          name: session.user.name || null, 
          email: session.user.email || null,
          image: (session.user as any)?.image || (session.user as any)?.picture || null
        },
        examiner: canExamineAny ? { id: userId, name: session.user.name || null } : null,
        createdAt: en.createdAt,
        chatMessages: []
      }))

    // 9. Final Merge and Sort
    const allExams = [...normalizedExams, ...virtualExams].sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()
      return dateB - dateA
    })

    console.log(`[DEBUG] Successfully assembled ${allExams.length} items`)
    
    // Final safety check for serialization
    const safeData = JSON.parse(JSON.stringify({ exams: allExams }))
    return NextResponse.json(safeData)

  } catch (error: any) {
    console.error('[CRITICAL] API Error in /api/academy/exams/my:', error)
    return NextResponse.json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
