import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getInternalVotingMetrics, rejectExpiredProposals } from '@/lib/voting-utils'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await rejectExpiredProposals()

    const url = new URL(request.url)
    const domainId = url.searchParams.get('domainId')

    const where: any = { status: 'PENDING' }
    
    // اگر domainId معتبر نبود (مثلاً رشته "undefined" یا خالی)، آن را نادیده می‌گیریم
    if (domainId && domainId !== 'undefined' && domainId !== 'null' && domainId.length > 5) {
      where.OR = [
        { parentId: domainId },
        { targetDomainId: domainId },
        { targetDomain: { parentId: domainId } }
      ]
    }

    // Ensure we don't crash if Prisma models are missing or connection fails
    let proposals = []
    try {
      proposals = await prisma.domainProposal.findMany({
        where,
        include: {
          proposer: { select: { id: true, name: true, email: true } },
          targetDomain: { select: { id: true, name: true, parentId: true } },
          votes: true
        },
        orderBy: { createdAt: 'desc' }
      })
    } catch (prismaError) {
      console.error('Prisma query error:', prismaError)
      throw new Error(`Prisma query failed: ${prismaError instanceof Error ? prismaError.message : String(prismaError)}`)
    }

    const enriched = await Promise.all(proposals.map(async (p) => {
      let votingDomainId: string | null = null
      if (p.type === 'CREATE') votingDomainId = p.parentId
      else votingDomainId = p.targetDomain?.parentId || null
      if (!votingDomainId && p.type === 'RENAME' && p.targetDomainId) {
        votingDomainId = p.targetDomainId
      }

      if (!votingDomainId) {
        return { ...p, voting: null }
      }

      const votes = p.votes.map(v => ({ voterId: v.voterId, score: v.score }))
      const metrics = await getInternalVotingMetrics(votingDomainId, votes)
      return { ...p, voting: metrics }
    }))

    return NextResponse.json({ proposals: enriched })
  } catch (error) {
    console.error('Error fetching domain proposals:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { type, name, description, parentId, targetDomainId } = body as {
      type: 'CREATE' | 'DELETE'
      name?: string
      description?: string
      parentId?: string
      targetDomainId?: string
    }

    if (!type || !['CREATE', 'DELETE', 'RENAME'].includes(type)) {
      return NextResponse.json({ error: 'Invalid proposal type' }, { status: 400 })
    }

    let finalParentId = parentId

    if (type === 'CREATE') {
      if (!name || !parentId) {
        return NextResponse.json({ error: 'Name and parentId are required for creation' }, { status: 400 })
      }
      
      // Check if user is expert of parent
      if (session.user.role !== 'ADMIN') {
        const isExpert = await prisma.domainExpert.findFirst({
          where: { domainId: parentId, userId: session.user.id }
        })
        if (!isExpert) return NextResponse.json({ error: 'Only parent domain experts can propose creation' }, { status: 403 })
      }
    } else if (type === 'DELETE') {
      if (!targetDomainId) {
        return NextResponse.json({ error: 'targetDomainId is required for deletion' }, { status: 400 })
      }
      const domain = await prisma.domain.findUnique({
        where: { id: targetDomainId },
        select: { id: true, parentId: true, slug: true }
      })
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
      if (domain.slug === 'philosophy') return NextResponse.json({ error: 'Cannot delete root' }, { status: 400 })

      finalParentId = domain.parentId ?? undefined

      // Check if user is expert of parent
      if (session.user.role !== 'ADMIN') {
        if (!domain.parentId) return NextResponse.json({ error: 'Only admins can propose deleting root domains' }, { status: 403 })
        const isExpert = await prisma.domainExpert.findFirst({
          where: { domainId: domain.parentId, userId: session.user.id }
        })
        if (!isExpert) return NextResponse.json({ error: 'Only parent domain experts can propose deletion' }, { status: 403 })
      }
    } else if (type === 'RENAME') {
      if (!targetDomainId || !name) {
        return NextResponse.json({ error: 'targetDomainId and name are required for rename' }, { status: 400 })
      }
      const domain = await prisma.domain.findUnique({
        where: { id: targetDomainId },
        select: { id: true, parentId: true, slug: true }
      })
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
      
      finalParentId = domain.parentId ?? undefined

      // Check permissions: Head of domain OR Member of parent
      if (session.user.role !== 'ADMIN') {
        let hasPermission = false
        
        // Check if head of domain
        const isHead = await prisma.domainExpert.findFirst({
          where: { domainId: targetDomainId, userId: session.user.id, role: 'HEAD' }
        })
        if (isHead) hasPermission = true

        // Check if expert of parent (if parent exists)
        if (!hasPermission && domain.parentId) {
          const isParentExpert = await prisma.domainExpert.findFirst({
            where: { domainId: domain.parentId, userId: session.user.id }
          })
          if (isParentExpert) hasPermission = true
        }

        // If root domain (no parent), allow any expert of the domain to propose rename
        if (!hasPermission && !domain.parentId) {
          const isExpert = await prisma.domainExpert.findFirst({
            where: { domainId: targetDomainId, userId: session.user.id }
          })
          if (isExpert) hasPermission = true
        }

        if (!hasPermission) {
          return NextResponse.json({ error: 'Only domain HEAD or parent domain experts can propose rename' }, { status: 403 })
        }
      }
    }

    console.log('Creating proposal:', { type, name, finalParentId, targetDomainId, proposerId: session.user.id })

    const proposal = await prisma.domainProposal.create({
      data: {
        type,
        name: name || null,
        description: description || null,
        parentId: finalParentId || null,
        targetDomainId: targetDomainId || null,
        proposerId: session.user.id
      }
    })

    return NextResponse.json({ success: true, proposal })
  } catch (error) {
    console.error('Error creating domain proposal:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
