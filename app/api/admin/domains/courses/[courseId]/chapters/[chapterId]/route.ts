import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function canManageDomainCourses(user: { id?: string; role?: string } | undefined, domainId: string) {
  const userId = (user?.id || '').trim()
  const role = (user?.role || '').trim()
  if (!userId) return { ok: false as const, status: 401 as const, error: 'Unauthorized' }
  if (role === 'ADMIN') return { ok: true as const, userId }

  const membership = await prisma.domainExpert.findFirst({
    where: { userId, domainId, role: { in: ['HEAD', 'EXPERT'] } },
    select: { id: true },
  })
  return membership ? { ok: true as const, userId } : { ok: false as const, status: 403 as const, error: 'Forbidden' }
}

export async function PATCH(request: NextRequest, { params }: { params: { courseId: string; chapterId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    const chapterId = (params.chapterId || '').trim()
    if (!courseId || !chapterId) return NextResponse.json({ error: 'courseId and chapterId are required' }, { status: 400 })

    const chapter = await prisma.courseChapter.findUnique({
      where: { id: chapterId },
      select: { id: true, courseId: true, status: true, course: { select: { domainId: true } } },
    })
    if (!chapter || chapter.courseId !== courseId) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, chapter.course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    if (chapter.status === 'APPROVED') {
      return NextResponse.json({ error: 'Approved chapters cannot be edited' }, { status: 409 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const content = typeof body.content === 'string' ? body.content : undefined
    const orderIndex = typeof body.orderIndex === 'number' ? body.orderIndex : undefined
    const changeReason = body.changeReason

    if (!title && !content && orderIndex === undefined) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const updated = await prisma.courseChapter.update({
      where: { id: chapterId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(orderIndex !== undefined ? { orderIndex } : {}),
        ...(changeReason !== undefined ? { changeReason: (changeReason as any) as Prisma.InputJsonValue } : {}),
        status: 'PENDING',
      },
      select: { id: true },
    })

    return NextResponse.json({ chapter: updated })
  } catch (error) {
    console.error('Error updating chapter:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { courseId: string; chapterId: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const courseId = (params.courseId || '').trim()
    const chapterId = (params.chapterId || '').trim()
    if (!courseId || !chapterId) return NextResponse.json({ error: 'courseId and chapterId are required' }, { status: 400 })

    const chapter = await prisma.courseChapter.findUnique({
      where: { id: chapterId },
      select: { id: true, courseId: true, course: { select: { domainId: true } } },
    })
    if (!chapter || chapter.courseId !== courseId) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, chapter.course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    await prisma.courseChapter.delete({
      where: { id: chapterId },
      select: { id: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chapter:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
