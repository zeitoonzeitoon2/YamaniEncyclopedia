import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const url = new URL(request.url)
    const pageParam = parseInt(url.searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '20', 10)
    const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = Number.isNaN(pageSizeParam) ? 20 : Math.min(Math.max(pageSizeParam, 1), 50)

    const totalCount = await prisma.post.count()

    const posts = await prisma.post.findMany({
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        originalPost: {
          select: {
            id: true,
            type: true,
            version: true,
          },
        },
        votes: {
          select: {
            id: true,
            score: true,
            adminId: true,
            admin: { select: { name: true } }
          },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    const items = posts.map(post => {
      const totalScore = post.votes ? post.votes.reduce((sum, v) => sum + v.score, 0) : 0
      return { ...post, totalScore }
    })

    return NextResponse.json({
      items,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    })
  } catch (error) {
    console.error('Error fetching admin posts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}