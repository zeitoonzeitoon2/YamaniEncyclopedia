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
    if (domainId) {
      where.OR = [
        { parentId: domainId },
        { parentId2: domainId },
        { targetDomainId: domainId },
        { targetDomain: { parentId: domainId } },
        { targetDomain: { parentLinks: { some: { parentDomainId: domainId } } } }
      ]
    }

    // Ensure we don't crash if Prisma models are missing or connection fails
    let proposals = []
    try {
      proposals = await prisma.domainProposal.findMany({
        where,
        include: {
          proposer: { select: { id: true, name: true, email: true } },
          targetDomain: { select: { id: true, name: true, parentId: true, parentLinks: { select: { parentDomainId: true } } } },
          votes: true
        },
        orderBy: { createdAt: 'desc' }
      })
    } catch (prismaError) {
      console.error('Prisma query error:', prismaError)
      throw new Error(`Prisma query failed: ${prismaError instanceof Error ? prismaError.message : String(prismaError)}`)
    }

    const enriched = await Promise.all(proposals.map(async (p) => {
      let votingDomainIds: string[] = []
      
      if (p.type === 'CREATE') {
        if (p.parentId) votingDomainIds.push(p.parentId)
        if (p.parentId2) votingDomainIds.push(p.parentId2)
      } else {
        if (p.targetDomain?.parentId) votingDomainIds.push(p.targetDomain.parentId)
        if (p.targetDomain?.parentLinks) {
          votingDomainIds.push(...p.targetDomain.parentLinks.map((l: any) => l.parentDomainId))
        }
      }

      if (votingDomainIds.length === 0 && p.type === 'RENAME' && p.targetDomainId) {
        votingDomainIds.push(p.targetDomainId)
      }

      if (votingDomainIds.length === 0) {
        return { ...p, voting: null }
      }

      const votes = p.votes.map(v => ({ voterId: v.voterId, score: v.score }))
      const metrics = await getInternalVotingMetrics(votingDomainIds, votes)
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
    const { type, name, description, parentId, parentId2, targetDomainId } = body as {
      type: 'CREATE' | 'DELETE'
      name?: string
      description?: string
      parentId?: string
      parentId2?: string
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
      
      // Check if user is expert of parent or any ancestor
      if (session.user.role !== 'ADMIN') {
        let hasPermission = false
        let currentId: string | null = parentId
        while (currentId) {
          const isExpert = await prisma.domainExpert.findFirst({
            where: { domainId: currentId, userId: session.user.id }
          })
          if (isExpert) {
            hasPermission = true
            break
          }
          const parentDomain: { parentId: string | null } | null = await prisma.domain.findUnique({
            where: { id: currentId },
            select: { parentId: true }
          })
          currentId = parentDomain?.parentId || null
        }
        
        if (!hasPermission) return NextResponse.json({ error: 'Only parent domain experts (or ancestors) can propose creation' }, { status: 403 })
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

      // Check if user is expert of parent or any ancestor
      if (session.user.role !== 'ADMIN') {
        if (!domain.parentId) return NextResponse.json({ error: 'Only admins can propose deleting root domains' }, { status: 403 })
        
        let hasPermission = false
        let currentId: string | null = domain.parentId
        while (currentId) {
          const isExpert = await prisma.domainExpert.findFirst({
            where: { domainId: currentId, userId: session.user.id }
          })
          if (isExpert) {
            hasPermission = true
            break
          }
          const parentDomain: { parentId: string | null } | null = await prisma.domain.findUnique({
            where: { id: currentId },
            select: { parentId: true }
          })
          currentId = parentDomain?.parentId || null
        }

        if (!hasPermission) return NextResponse.json({ error: 'Only parent domain experts (or ancestors) can propose deletion' }, { status: 403 })
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

    console.log('Creating proposal:', { type, name, finalParentId, parentId2, targetDomainId, proposerId: session.user.id })

    const proposal = await prisma.domainProposal.create({
      data: {
        type,
        name: name || null,
        description: description || null,
        parentId: finalParentId || null,
        parentId2: parentId2 || null,
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
