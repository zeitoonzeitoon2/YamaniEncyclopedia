import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = new Set(['HEAD', 'EXPERT'])

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const domainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const role = typeof body.role === 'string' ? body.role.trim() : ''

    if (!domainId || !userId || !role) {
      return NextResponse.json({ error: 'domainId, userId, role are required' }, { status: 400 })
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const [domain, user] = await Promise.all([
      prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ])

    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const expert = await prisma.domainExpert.upsert({
      where: { userId_domainId: { userId, domainId } },
      update: { role },
      create: { userId, domainId, role },
      select: { id: true, role: true, userId: true, domainId: true },
    })

    return NextResponse.json({ success: true, expert })
  } catch (error) {
    console.error('Error assigning expert:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const domainId = typeof body.domainId === 'string' ? body.domainId.trim() : ''
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''

    if (!domainId || !userId) {
      return NextResponse.json({ error: 'domainId and userId are required' }, { status: 400 })
    }

    await prisma.domainExpert.delete({
      where: { userId_domainId: { userId, domainId } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing expert:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

