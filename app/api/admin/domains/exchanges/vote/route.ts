import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateVotingResult } from '@/lib/voting-utils'

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
      where: { userId: session.user.id, domainId: proposal.proposerDomainId }
    })

    const targetMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.targetDomainId }
    })

    if (!proposerMembership && !targetMembership) {
      return NextResponse.json({ error: 'You are not an expert in either affected domain' }, { status: 403 })
    }

    // A user can be an expert in both, but usually they vote for one side at a time.
    // For simplicity, if they are in both, they vote for both or we require them to specify.
    // Let's assume they vote for all domains they are part of.
    const affectedDomains = []
    if (proposerMembership) affectedDomains.push(proposal.proposerDomainId)
    if (targetMembership) affectedDomains.push(proposal.targetDomainId)

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
    const proposerVotes = await prisma.domainExchangeVote.findMany({
      where: { proposalId, domainId: proposal.proposerDomainId }
    })
    const targetVotes = await prisma.domainExchangeVote.findMany({
      where: { proposalId, domainId: proposal.targetDomainId }
    })

    const proposerResult = await calculateVotingResult(
      proposerVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' })),
      proposal.proposerDomainId,
      'DIRECT'
    )
    const targetResult = await calculateVotingResult(
      targetVotes.map(v => ({ voterId: v.voterId, vote: v.vote as 'APPROVE' | 'REJECT' })),
      proposal.targetDomainId,
      'DIRECT'
    )

    if (proposerResult.rejections > 50 || targetResult.rejections > 50) {
      await prisma.domainExchangeProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED' })
    }

    if (proposerResult.approvals > 50 && targetResult.approvals > 50) {
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

    return NextResponse.json({ status: 'PENDING' })
  } catch (error) {
    console.error('Error voting on exchange proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
