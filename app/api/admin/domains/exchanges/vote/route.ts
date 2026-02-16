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

    const { proposalId, vote } = await req.json()

    if (!proposalId || !vote) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const proposal = await prisma.domainExchangeProposal.findUnique({
      where: { id: proposalId },
      include: {
        proposerDomain: true,
        targetDomain: true
      }
    })

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    if (proposal.status !== 'PENDING') {
      // If it's already executed/approved/rejected, check if the user had already voted.
      // If they did, just return success instead of an error to avoid confusion on slow UI updates.
      const existingVote = await prisma.domainExchangeVote.findFirst({
        where: { proposalId, voterId: session.user.id }
      })
      
      if (existingVote) {
        return NextResponse.json({ status: proposal.status, message: 'Vote already recorded' })
      }
      
      return NextResponse.json({ error: 'Proposal is no longer pending' }, { status: 400 })
    }

    // Determine which domain the user is voting for
    const proposerMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.proposerDomainId, role: { in: ['HEAD', 'EXPERT'] } }
    })

    const targetMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.targetDomainId, role: { in: ['HEAD', 'EXPERT'] } }
    })

    const isGlobalAdmin = session.user.role === 'ADMIN' || session.user.role === 'EXPERT'

    if (!proposerMembership && !targetMembership && !isGlobalAdmin) {
      return NextResponse.json({ error: 'You are not an expert in either affected domain' }, { status: 403 })
    }

    // A user can be an expert in both, but usually they vote for one side at a time.
    // For simplicity, if they are in both, they vote for both or we require them to specify.
    // Let's assume they vote for all domains they are part of.
    const affectedDomains = []
    if (proposerMembership || isGlobalAdmin) affectedDomains.push(proposal.proposerDomainId)
    if (targetMembership || isGlobalAdmin) affectedDomains.push(proposal.targetDomainId)

    // Record votes
    for (const dId of affectedDomains) {
      await prisma.domainExchangeVote.upsert({
        where: {
          proposalId_voterId_domainId: {
            proposalId,
            voterId: session.user.id,
            domainId: dId
          }
        },
        update: { vote },
        create: {
          proposalId,
          voterId: session.user.id,
          domainId: dId,
          vote
        }
      })
    }

    // Check for consensus
    const getWeightedCounts = async (domainId: string, proposalId: string) => {
      const experts = await prisma.domainExpert.findMany({ where: { domainId } })
      const totalPoints = experts.reduce((sum, e) => sum + (e.role === 'HEAD' ? 2 : 1), 0)
      
      const votes = await prisma.domainExchangeVote.findMany({
        where: { proposalId, domainId }
      })
      
      const expertMap = new Map(experts.map(e => [e.userId, e.role]))
      
      let approvedPoints = 0
      let rejectedPoints = 0
      
      for (const v of votes) {
        const role = expertMap.get(v.voterId)
        if (role) {
          const points = role === 'HEAD' ? 2 : 1
          if (v.vote === 'APPROVE') approvedPoints += points
          else if (v.vote === 'REJECT') rejectedPoints += points
        }
      }
      
      return { totalPoints, approvedPoints, rejectedPoints }
    }

    const proposerStats = await getWeightedCounts(proposal.proposerDomainId, proposalId)
    const targetStats = await getWeightedCounts(proposal.targetDomainId, proposalId)
    
    // Majority check (more than 50%)
    const proposerThreshold = proposerStats.totalPoints <= 2 ? 1 : Math.floor(proposerStats.totalPoints / 2) + 1
    const targetThreshold = targetStats.totalPoints <= 2 ? 1 : Math.floor(targetStats.totalPoints / 2) + 1

    const proposerApproved = proposerStats.approvedPoints >= proposerThreshold
    const targetApproved = targetStats.approvedPoints >= targetThreshold

    // If either side rejects by majority, proposal fails
    if (proposerStats.rejectedPoints >= proposerThreshold || targetStats.rejectedPoints >= targetThreshold) {
      await prisma.domainExchangeProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED' })
    }

    if (proposerApproved && targetApproved) {
      // EXECUTE EXCHANGE
      await prisma.$transaction(async (tx) => {
        // 1. Proposer domain gives shares to Target domain
        if (proposal.percentageProposerToTarget > 0) {
          // Decrease proposer's own share
          await tx.domainVotingShare.upsert({
            where: {
              domainId_domainWing_ownerDomainId_ownerWing: {
                domainId: proposal.proposerDomainId,
                domainWing: 'RIGHT',
                ownerDomainId: proposal.proposerDomainId,
                ownerWing: 'RIGHT'
              }
            },
            update: { percentage: { decrement: proposal.percentageProposerToTarget } },
            create: {
              domainId: proposal.proposerDomainId,
              domainWing: 'RIGHT',
              ownerDomainId: proposal.proposerDomainId,
              ownerWing: 'RIGHT',
              percentage: 100 - proposal.percentageProposerToTarget
            }
          })

          // Increase or create target's share in proposer domain
          await tx.domainVotingShare.upsert({
            where: {
              domainId_domainWing_ownerDomainId_ownerWing: {
                domainId: proposal.proposerDomainId,
                domainWing: 'RIGHT',
                ownerDomainId: proposal.targetDomainId,
                ownerWing: 'RIGHT'
              }
            },
            update: { percentage: { increment: proposal.percentageProposerToTarget } },
            create: {
              domainId: proposal.proposerDomainId,
              domainWing: 'RIGHT',
              ownerDomainId: proposal.targetDomainId,
              ownerWing: 'RIGHT',
              percentage: proposal.percentageProposerToTarget
            }
          })
        }

        // 2. Target domain gives shares to Proposer domain
        if (proposal.percentageTargetToProposer > 0) {
          // Decrease target's own share
          await tx.domainVotingShare.upsert({
            where: {
              domainId_domainWing_ownerDomainId_ownerWing: {
                domainId: proposal.targetDomainId,
                domainWing: 'RIGHT',
                ownerDomainId: proposal.targetDomainId,
                ownerWing: 'RIGHT'
              }
            },
            update: { percentage: { decrement: proposal.percentageTargetToProposer } },
            create: {
              domainId: proposal.targetDomainId,
              domainWing: 'RIGHT',
              ownerDomainId: proposal.targetDomainId,
              ownerWing: 'RIGHT',
              percentage: 100 - proposal.percentageTargetToProposer
            }
          })

          // Increase or create proposer's share in target domain
          await tx.domainVotingShare.upsert({
            where: {
              domainId_domainWing_ownerDomainId_ownerWing: {
                domainId: proposal.targetDomainId,
                domainWing: 'RIGHT',
                ownerDomainId: proposal.proposerDomainId,
                ownerWing: 'RIGHT'
              }
            },
            update: { percentage: { increment: proposal.percentageTargetToProposer } },
            create: {
              domainId: proposal.targetDomainId,
              domainWing: 'RIGHT',
              ownerDomainId: proposal.proposerDomainId,
              ownerWing: 'RIGHT',
              percentage: proposal.percentageTargetToProposer
            }
          })
        }

        // Mark as executed
        await tx.domainExchangeProposal.update({
          where: { id: proposalId },
          data: { status: 'EXECUTED' }
        })
      })

      return NextResponse.json({ status: 'EXECUTED' })
    }

    return NextResponse.json({ status: 'PENDING', proposerApproved, targetApproved })
  } catch (error) {
    console.error('Error voting on exchange proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
