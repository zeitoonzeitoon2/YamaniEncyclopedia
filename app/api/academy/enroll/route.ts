import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const userId = (session?.user?.id || '').trim()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let courseId = ''
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      courseId = typeof body.courseId === 'string' ? body.courseId.trim() : ''
    } else {
      const form = await request.formData().catch(() => null)
      if (form) {
        const raw = form.get('courseId')
        courseId = typeof raw === 'string' ? raw.trim() : ''
      }
    }

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, isActive: true },
    })
    if (!course || course.status !== 'APPROVED' || !course.isActive) {
      return NextResponse.json({ error: 'Course not available' }, { status: 404 })
    }

    const existing = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { userId: true, courseId: true, status: true },
    })
    if (existing) {
      return NextResponse.json({ success: true, status: existing.status })
    }

    await prisma.userCourse.create({
      data: { userId, courseId, status: 'ENROLLED' },
      select: { userId: true, courseId: true },
    })

    return NextResponse.json({ success: true, status: 'ENROLLED' })
  } catch (error) {
    console.error('Error enrolling course:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
