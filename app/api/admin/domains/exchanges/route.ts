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

    const { proposerDomainId, targetDomainId, percentageProposerToTarget, percentageTargetToProposer } = await req.json()

    if (!proposerDomainId || !targetDomainId || percentageProposerToTarget === undefined || percentageTargetToProposer === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (proposerDomainId === targetDomainId) {
      return NextResponse.json({ error: 'Cannot exchange with the same domain' }, { status: 400 })
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

    // Check if proposer domain owns enough percentage to give
    let proposerOwnShare = await prisma.domainVotingShare.findUnique({
      where: {
        domainId_ownerDomainId: {
          domainId: proposerDomainId,
          ownerDomainId: proposerDomainId
        }
      }
    })

    // If no share record exists, it means the domain still owns 100% of itself
    const proposerPercentage = proposerOwnShare ? proposerOwnShare.percentage : 100

    if (proposerPercentage < percentageProposerToTarget) {
      return NextResponse.json({ error: 'Proposer domain does not own enough voting shares to give' }, { status: 400 })
    }

    // Check if target domain owns enough percentage to give
    let targetOwnShare = await prisma.domainVotingShare.findUnique({
      where: {
        domainId_ownerDomainId: {
          domainId: targetDomainId,
          ownerDomainId: targetDomainId
        }
      }
    })

    // If no share record exists, it means the domain still owns 100% of itself
    const targetPercentage = targetOwnShare ? targetOwnShare.percentage : 100

    if (targetPercentage < percentageTargetToProposer) {
      return NextResponse.json({ error: 'Target domain does not own enough voting shares to give' }, { status: 400 })
    }

    // Create the proposal
    const proposal = await prisma.domainExchangeProposal.create({
      data: {
        proposerDomainId,
        targetDomainId,
        percentageProposerToTarget,
        percentageTargetToProposer,
        status: 'PENDING'
      }
    })

    return NextResponse.json({ proposal })
  } catch (error) {
    console.error('Error creating exchange proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const domainId = searchParams.get('domainId')

    const where: any = { status: 'PENDING' }
    if (domainId) {
      where.OR = [{ proposerDomainId: domainId }, { targetDomainId: domainId }]
    }

    const proposals = await prisma.domainExchangeProposal.findMany({
      where,
      include: {
        proposerDomain: true,
        targetDomain: true,
        votes: {
          include: {
            voter: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const proposalsWithStats = await Promise.all(proposals.map(async (p) => {
      const [proposerExperts, targetExperts] = await Promise.all([
        prisma.domainExpert.count({ where: { domainId: p.proposerDomainId } }),
        prisma.domainExpert.count({ where: { domainId: p.targetDomainId } })
      ])

      const proposerVotes = p.votes.filter(v => v.domainId === p.proposerDomainId && v.vote === 'APPROVE').length
      const targetVotes = p.votes.filter(v => v.domainId === p.targetDomainId && v.vote === 'APPROVE').length

      return {
        ...p,
        stats: {
          proposerExperts,
          targetExperts,
          proposerVotes,
          targetVotes
        }
      }
    }))

    return NextResponse.json({ proposals: proposalsWithStats })
  } catch (error) {
    console.error('Error fetching exchange proposals:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
