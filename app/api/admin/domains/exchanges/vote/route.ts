import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkScoreApproval } from '@/lib/voting-utils'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { proposalId, score } = await req.json()

    if (!proposalId || typeof score !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
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
      const existingVote = await prisma.domainExchangeVote.findFirst({
        where: { proposalId, voterId: session.user.id }
      })
      
      if (existingVote) {
        return NextResponse.json({ status: proposal.status, message: 'Vote already recorded' })
      }
      
      return NextResponse.json({ error: 'Proposal is no longer pending' }, { status: 400 })
    }

    const proposerMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.proposerDomainId }
    })
    const targetMembership = await prisma.domainExpert.findFirst({
      where: { userId: session.user.id, domainId: proposal.targetDomainId }
    })

    if (!proposerMembership && !targetMembership) {
      return NextResponse.json({ error: 'You are not an expert in either affected domain' }, { status: 403 })
    }

    const affectedDomains = []
    if (proposerMembership) affectedDomains.push(proposal.proposerDomainId)
    if (targetMembership) affectedDomains.push(proposal.targetDomainId)

    for (const dId of affectedDomains) {
      await prisma.domainExchangeVote.upsert({
        where: {
          proposalId_voterId_domainId: {
            proposalId,
            voterId: session.user.id,
            domainId: dId
          }
        },
        update: { score },
        create: {
          proposalId,
          voterId: session.user.id,
          domainId: dId,
          score
        }
      })
    }

    const proposerVotes = await prisma.domainExchangeVote.findMany({
      where: { proposalId, domainId: proposal.proposerDomainId }
    })
    const targetVotes = await prisma.domainExchangeVote.findMany({
      where: { proposalId, domainId: proposal.targetDomainId }
    })

    const proposerResult = await checkScoreApproval(
      proposal.proposerDomainId,
      proposerVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )
    const targetResult = await checkScoreApproval(
      proposal.targetDomainId,
      targetVotes.map(v => ({ voterId: v.voterId, score: v.score }))
    )

    if (proposerResult.rejected || targetResult.rejected) {
      await prisma.domainExchangeProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' }
      })
      return NextResponse.json({ status: 'REJECTED', proposerResult, targetResult })
    }

    if (proposerResult.approved && targetResult.approved) {
      await prisma.$transaction(async (tx) => {
        if (proposal.percentageProposerToTarget > 0) {
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

        if (proposal.percentageTargetToProposer > 0) {
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

        await tx.domainExchangeProposal.update({
          where: { id: proposalId },
          data: { status: 'EXECUTED' }
        })
      })

      return NextResponse.json({ status: 'EXECUTED', proposerResult, targetResult })
    }

    return NextResponse.json({ status: 'PENDING', proposerResult, targetResult })
  } catch (error) {
    console.error('Error voting on exchange proposal:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
