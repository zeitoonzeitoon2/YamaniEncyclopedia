import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RouteParams = { params: { id: string } }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const me = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: { votes: true },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.authorId !== me.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (post.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending posts can be withdrawn' }, { status: 400 })
    }

    const [adminCount, supervisorCount] = await Promise.all([
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'SUPERVISOR' } }),
    ])
    const threshold = Math.ceil((supervisorCount + adminCount) / 2)
    const participationThreshold = Math.ceil((supervisorCount + adminCount) / 2)

    const totalScore = post.votes.reduce((sum, v) => sum + v.score, 0)
    const participationCount = await prisma.vote.count({
      where: { postId: post.id, admin: { role: { in: ['SUPERVISOR', 'ADMIN'] } } },
    })

    if (participationCount >= participationThreshold || Math.abs(totalScore) >= threshold) {
      return NextResponse.json({ error: 'Cannot withdraw after thresholds' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.commentRead.deleteMany({ where: { postId: post.id } }),
      prisma.comment.deleteMany({ where: { postId: post.id } }),
      prisma.vote.deleteMany({ where: { postId: post.id } }),
      prisma.post.update({ where: { id: post.id }, data: { status: 'DRAFT' } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error withdrawing post:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}