import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: { id: string }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = (params?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const domain = await prisma.domain.findUnique({
      where: { id },
      select: { id: true, slug: true, _count: { select: { posts: true, children: true } } },
    })

    if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (domain.slug === 'philosophy') {
      return NextResponse.json({ error: 'Cannot delete root domain' }, { status: 409 })
    }

    if (domain._count.children > 0 || domain._count.posts > 0) {
      return NextResponse.json(
        { error: 'Domain has dependencies', counts: { children: domain._count.children, posts: domain._count.posts } },
        { status: 409 }
      )
    }

    await prisma.$transaction([
      prisma.domainExpert.deleteMany({ where: { domainId: id } }),
      prisma.domain.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting domain:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

