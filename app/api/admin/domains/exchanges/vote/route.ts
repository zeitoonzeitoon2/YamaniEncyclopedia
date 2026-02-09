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
      return NextResponse.json({ error: 'Proposal is no longer pending' }, { status: 400 })
    }

    // Determine which domain the user is voting for
    const proposerMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.proposerDomainId, role: { in: ['HEAD', 'EXPERT'] } }
    })

    const targetMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.targetDomainId, role: { in: ['HEAD', 'EXPERT'] } }
    })

    if (!proposerMembership && !targetMembership && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'You are not an expert in either affected domain' }, { status: 403 })
    }

    // A user can be an expert in both, but usually they vote for one side at a time.
    // For simplicity, if they are in both, they vote for both or we require them to specify.
    // Let's assume they vote for all domains they are part of.
    const affectedDomains = []
    if (proposerMembership || session.user.role === 'ADMIN') affectedDomains.push(proposal.proposerDomainId)
    if (targetMembership || session.user.role === 'ADMIN') affectedDomains.push(proposal.targetDomainId)

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
    const proposerExpertsCount = await prisma.domainExpert.count({ where: { domainId: proposal.proposerDomainId } })
    const targetExpertsCount = await prisma.domainExpert.count({ where: { domainId: proposal.targetDomainId } })

    const proposerApproveVotes = await prisma.domainExchangeVote.count({
      where: { proposalId, domainId: proposal.proposerDomainId, vote: 'APPROVE' }
    })

    const targetApproveVotes = await prisma.domainExchangeVote.count({
      where: { proposalId, domainId: proposal.targetDomainId, vote: 'APPROVE' }
    })

    const proposerRejected = await prisma.domainExchangeVote.count({
      where: { proposalId, domainId: proposal.proposerDomainId, vote: 'REJECT' }
    })

    const targetRejected = await prisma.domainExchangeVote.count({
      where: { proposalId, domainId: proposal.targetDomainId, vote: 'REJECT' }
    })

    // Majority check (more than 50%)
    const proposerThreshold = proposerExpertsCount <= 2 ? 1 : Math.floor(proposerExpertsCount / 2) + 1
    const targetThreshold = targetExpertsCount <= 2 ? 1 : Math.floor(targetExpertsCount / 2) + 1

    const proposerApproved = proposerApproveVotes >= proposerThreshold
    const targetApproved = targetApproveVotes >= targetThreshold

    // If either side rejects by majority, proposal fails
    if (proposerRejected >= proposerThreshold || targetRejected >= targetThreshold) {
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
          await tx.domainVotingShare.update({
            where: {
              domainId_ownerDomainId: {
                domainId: proposal.proposerDomainId,
                ownerDomainId: proposal.proposerDomainId
              }
            },
            data: { percentage: { decrement: proposal.percentageProposerToTarget } }
          })

          // Increase or create target's share in proposer domain
          await tx.domainVotingShare.upsert({
            where: {
              domainId_ownerDomainId: {
                domainId: proposal.proposerDomainId,
                ownerDomainId: proposal.targetDomainId
              }
            },
            update: { percentage: { increment: proposal.percentageProposerToTarget } },
            create: {
              domainId: proposal.proposerDomainId,
              ownerDomainId: proposal.targetDomainId,
              percentage: proposal.percentageProposerToTarget
            }
          })
        }

        // 2. Target domain gives shares to Proposer domain
        if (proposal.percentageTargetToProposer > 0) {
          // Decrease target's own share
          await tx.domainVotingShare.update({
            where: {
              domainId_ownerDomainId: {
                domainId: proposal.targetDomainId,
                ownerDomainId: proposal.targetDomainId
              }
            },
            data: { percentage: { decrement: proposal.percentageTargetToProposer } }
          })

          // Increase or create proposer's share in target domain
          await tx.domainVotingShare.upsert({
            where: {
              domainId_ownerDomainId: {
                domainId: proposal.targetDomainId,
                ownerDomainId: proposal.proposerDomainId
              }
            },
            update: { percentage: { increment: proposal.percentageTargetToProposer } },
            create: {
              domainId: proposal.targetDomainId,
              ownerDomainId: proposal.proposerDomainId,
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
