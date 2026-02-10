import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId, chapterId } = params
    
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { domainId: true }
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const questions = await prisma.chapterQuestion.findMany({
      where: { chapterId },
      include: {
        options: true,
        author: { select: { id: true, name: true, email: true } },
        votes: { select: { voterId: true, vote: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string; chapterId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId, chapterId } = params
    const body = await request.json()
    const { question, options } = body

    if (!question || !Array.isArray(options) || options.length !== 4) {
      return NextResponse.json({ error: 'Question and 4 options are required' }, { status: 400 })
    }

    const correctOptions = options.filter(opt => opt.isCorrect)
    if (correctOptions.length !== 1) {
      return NextResponse.json({ error: 'Exactly one correct option is required' }, { status: 400 })
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { domainId: true }
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const perm = await canManageDomainCourses(session.user, course.domainId)
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

    const newQuestion = await prisma.chapterQuestion.create({
      data: {
        question,
        chapterId,
        authorId: perm.userId,
        status: 'PENDING',
        options: {
          create: options.map(opt => ({
            text: opt.text,
            isCorrect: opt.isCorrect
          }))
        }
      },
      include: {
        options: true
      }
    })

    return NextResponse.json({ question: newQuestion }, { status: 201 })
  } catch (error) {
    console.error('Error creating question:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
