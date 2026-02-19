import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { proposerDomainId, targetDomainId, percentageInvested, percentageReturn, endDate, proposerWing = 'RIGHT', targetWing = 'RIGHT' } = await req.json()

    if (!proposerDomainId || !targetDomainId || percentageInvested === undefined || percentageReturn === undefined || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (proposerDomainId === targetDomainId) {
      return NextResponse.json({ error: 'Cannot invest in the same domain' }, { status: 400 })
    }

    // Restriction: Only Direct Parent and Direct Child can invest in each other
    const proposer = await prisma.domain.findUnique({ where: { id: proposerDomainId }, select: { parentId: true } })
    const target = await prisma.domain.findUnique({ where: { id: targetDomainId }, select: { parentId: true } })

    const isParentChild = proposer?.parentId === targetDomainId || target?.parentId === proposerDomainId
    if (!isParentChild) {
      return NextResponse.json({ error: 'Investments are only allowed between direct parent and child domains' }, { status: 403 })
    }

    // Check if proposer is an expert in the proposer domain and specific wing
    const membership = await prisma.domainExpert.findFirst({
      where: {
        userId: session.user.id,
        domainId: proposerDomainId,
        wing: proposerWing,
        role: { in: ['HEAD', 'EXPERT'] }
      }
    })

    if (!membership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: `You must be an expert in the ${proposerWing} wing of the proposer domain` }, { status: 403 })
    }

    // Check if proposer domain (wing) owns enough percentage to give (invest)
    // We check their permanent shares (Internal Share of that Wing). 
    const proposerOwnShare = await prisma.domainVotingShare.findFirst({
      where: {
        domainId: proposerDomainId,
        domainWing: proposerWing,
        ownerDomainId: proposerDomainId,
        ownerWing: proposerWing
      }
    })

    const currentPermanentPercentage = proposerOwnShare ? proposerOwnShare.percentage : (proposerWing === 'RIGHT' ? 100 : 0)
    
    // Also consider existing ACTIVE investments where this wing is already giving power
    const existingOutbound = await prisma.domainInvestment.aggregate({
      where: { 
        proposerDomainId, 
        proposerWing,
        status: 'ACTIVE' 
      },
      _sum: { percentageInvested: true }
    })

    // And existing ACTIVE investments where this wing is promising returns (Target=Self, TargetWing=SelfWing)
    // Because if we promised to return power, we shouldn't invest it elsewhere? 
    // Usually Return is a future obligation. But "percentageInvested" is immediate transfer.
    // Let's count promised returns as "Reserved" if we want to be safe.
    const promisedReturns = await prisma.domainInvestment.aggregate({
      where: {
        targetDomainId: proposerDomainId,
        targetWing: proposerWing,
        status: 'ACTIVE'
      },
      _sum: { percentageReturn: true }
    })
    
    const availablePercentage = currentPermanentPercentage - (existingOutbound._sum.percentageInvested || 0) - (promisedReturns._sum.percentageReturn || 0)

    if (availablePercentage < percentageInvested) {
      return NextResponse.json({ error: `Proposer domain (${proposerWing}) does not have enough available voting power to invest` }, { status: 400 })
    }

    // Create the investment proposal
    const investment = await prisma.domainInvestment.create({
      data: {
        proposerDomainId,
        targetDomainId,
        percentageInvested,
        percentageReturn,
        proposerWing,
        targetWing,
        endDate: new Date(endDate),
        status: 'PENDING'
      }
    })

    return NextResponse.json({ investment })
  } catch (error) {
    console.error('Error creating investment proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const domainId = searchParams.get('domainId')

    const where: any = {}
    if (domainId) {
      where.OR = [{ proposerDomainId: domainId }, { targetDomainId: domainId }]
    }

    const investments = await prisma.domainInvestment.findMany({
      where,
      include: {
        proposerDomain: { select: { id: true, name: true, slug: true } },
        targetDomain: { select: { id: true, name: true, slug: true } },
        votes: true
      },
      orderBy: { createdAt: 'desc' }
    })

    const enrichedInvestments = await Promise.all(investments.map(async (inv) => {
      // Fetch experts to validate votes
      const proposerExperts = await prisma.domainExpert.findMany({
        where: {
          domainId: inv.proposerDomainId,
          wing: inv.proposerWing
        },
        select: { userId: true }
      })
      const proposerExpertIds = new Set(proposerExperts.map(e => e.userId))

      const targetExperts = await prisma.domainExpert.findMany({
        where: {
          domainId: inv.targetDomainId,
          wing: inv.targetWing
        },
        select: { userId: true }
      })
      const targetExpertIds = new Set(targetExperts.map(e => e.userId))

      const proposerTotal = proposerExperts.length
      const targetTotal = targetExperts.length

      // Filter votes: Only count votes from current experts
      // If no experts exist, we might count admin votes (fallback), so we keep them all
      // But if experts exist, we strictly filter.
      
      let proposerVotes = inv.votes.filter(v => v.domainId === inv.proposerDomainId)
      if (proposerTotal > 0) {
        proposerVotes = proposerVotes.filter(v => proposerExpertIds.has(v.voterId))
      }

      let targetVotes = inv.votes.filter(v => v.domainId === inv.targetDomainId)
      if (targetTotal > 0) {
        targetVotes = targetVotes.filter(v => targetExpertIds.has(v.voterId))
      }

      return {
        ...inv,
        stats: {
          proposer: {
            total: proposerTotal,
            approved: proposerVotes.filter(v => v.vote === 'APPROVE').length,
            rejected: proposerVotes.filter(v => v.vote === 'REJECT').length
          },
          target: {
            total: targetTotal,
            approved: targetVotes.filter(v => v.vote === 'APPROVE').length,
            rejected: targetVotes.filter(v => v.vote === 'REJECT').length
          }
        }
      }
    }))

    return NextResponse.json({ investments: enrichedInvestments })
  } catch (error) {
    console.error('Error fetching investments:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
