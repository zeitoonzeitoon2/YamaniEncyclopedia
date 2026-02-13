import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const domainId = url.searchParams.get('domainId')

    const proposals = await prisma.domainProposal.findMany({
      where: {
        OR: [
          { parentId: domainId || undefined },
          { targetDomainId: domainId || undefined },
          { targetDomain: { parentId: domainId || undefined } }
        ],
        status: 'PENDING'
      },
      include: {
        proposer: { select: { name: true, email: true } },
        targetDomain: { select: { name: true, parentId: true } },
        votes: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ proposals })
  } catch (error) {
    console.error('Error fetching domain proposals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, name, description, parentId, targetDomainId } = body

    if (!type || !['CREATE', 'DELETE'].includes(type)) {
      return NextResponse.json({ error: 'Invalid proposal type' }, { status: 400 })
    }

    if (type === 'CREATE') {
      if (!name || !parentId) {
        return NextResponse.json({ error: 'Name and parentId are required for creation' }, { status: 400 })
      }
      // Check if user is expert of parent
      if (session.user.role !== 'ADMIN') {
        const isExpert = await prisma.domainExpert.findFirst({
          where: { domainId: parentId, userId: session.user.id }
        })
        if (!isExpert) return NextResponse.json({ error: 'Only parent domain experts can propose subdomains' }, { status: 403 })
      }
    } else if (type === 'DELETE') {
      if (!targetDomainId) {
        return NextResponse.json({ error: 'targetDomainId is required for deletion' }, { status: 400 })
      }
      const domain = await prisma.domain.findUnique({
        where: { id: targetDomainId },
        select: { parentId: true, slug: true }
      })
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
      if (domain.slug === 'philosophy') return NextResponse.json({ error: 'Cannot delete root' }, { status: 400 })

      // Check if user is expert of parent
      if (session.user.role !== 'ADMIN') {
        if (!domain.parentId) return NextResponse.json({ error: 'Only admins can propose deleting root domains' }, { status: 403 })
        const isExpert = await prisma.domainExpert.findFirst({
          where: { domainId: domain.parentId, userId: session.user.id }
        })
        if (!isExpert) return NextResponse.json({ error: 'Only parent domain experts can propose deletion' }, { status: 403 })
      }
    }

    const proposal = await prisma.domainProposal.create({
      data: {
        type,
        name,
        description,
        parentId,
        targetDomainId,
        proposerId: session.user.id
      }
    })

    return NextResponse.json({ success: true, proposal })
  } catch (error) {
    console.error('Error creating domain proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
