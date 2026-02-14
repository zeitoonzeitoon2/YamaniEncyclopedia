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

    const { proposerDomainId, targetDomainId, percentageInvested, percentageReturn, endDate } = await req.json()

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

    // Check if proposer is an expert in the proposer domain
    const membership = await prisma.domainExpert.findFirst({
      where: {
        userId: session.user.id,
        domainId: proposerDomainId,
        role: { in: ['HEAD', 'EXPERT'] }
      }
    })

    if (!membership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'You must be an expert in the proposer domain' }, { status: 403 })
    }

    // Check if proposer domain owns enough percentage to give (invest)
    // We check their permanent shares. 
    const proposerOwnShare = await prisma.domainVotingShare.findUnique({
      where: {
        domainId_ownerDomainId: {
          domainId: proposerDomainId,
          ownerDomainId: proposerDomainId
        }
      }
    })

    const currentPermanentPercentage = proposerOwnShare ? proposerOwnShare.percentage : 100
    
    // Also consider existing ACTIVE investments where this domain is already giving power
    const existingOutbound = await prisma.domainInvestment.aggregate({
      where: { proposerDomainId, status: 'ACTIVE' },
      _sum: { percentageInvested: true }
    })
    
    const availablePercentage = currentPermanentPercentage - (existingOutbound._sum.percentageInvested || 0)

    if (availablePercentage < percentageInvested) {
      return NextResponse.json({ error: 'Proposer domain does not have enough available voting power to invest' }, { status: 400 })
    }

    // Create the investment proposal
    const investment = await prisma.domainInvestment.create({
      data: {
        proposerDomainId,
        targetDomainId,
        percentageInvested,
        percentageReturn,
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
        targetDomain: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ investments })
  } catch (error) {
    console.error('Error fetching investments:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
