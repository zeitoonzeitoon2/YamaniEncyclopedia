import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user?.role !== 'ADMIN') {
      const userId = (session.user?.id || '').trim()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const membership = await prisma.domainExpert.findFirst({
        where: { userId },
        select: { id: true },
      })
      if (!membership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const qRaw = (searchParams.get('q') || '').trim()
    const q = qRaw.length > 100 ? qRaw.slice(0, 100) : qRaw

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] })
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ role: 'desc' }, { email: 'asc' }],
      take: 10,
      select: { id: true, name: true, email: true, role: true },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error searching users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
