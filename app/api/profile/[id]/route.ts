import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(20, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)))
    const skip = (page - 1) * pageSize

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, image: true, role: true, bio: true, createdAt: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const posts = await prisma.post.findMany({
      where: { authorId: params.id },
      select: {
        id: true,
        content: true,
        status: true,
        version: true,
        revisionNumber: true,
        createdAt: true,
        type: true,
        originalPost: { select: { id: true, version: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    })
    const total = await prisma.post.count({ where: { authorId: params.id } })

    return NextResponse.json({ user, posts, page, pageSize, total })
  } catch (error: any) {
    console.error('GET /api/profile/[id] error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}