import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '10', 10), 1), 20)

    const totalCount = await prisma.post.count({ where: { authorId: params.id } })
    const posts = await prisma.post.findMany({
      where: { authorId: params.id },
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        author: { select: { id: true, name: true, image: true, role: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    return NextResponse.json({ items: posts, page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}