import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // اجازه دسترسی: محرر، مشرف، مدیر
    const me = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!me || !['EDITOR', 'SUPERVISOR', 'ADMIN'].includes(me.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()

    const users = await prisma.user.findMany({
      where: {
        role: { in: ['EDITOR', 'SUPERVISOR'] },
        ...(q
          ? {
              name: { startsWith: q, mode: 'insensitive' },
            }
          : {}),
      },
      select: { id: true, name: true, role: true, image: true },
      orderBy: [{ role: 'desc' }, { name: 'asc' }],
      take: 200,
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error fetching researchers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}