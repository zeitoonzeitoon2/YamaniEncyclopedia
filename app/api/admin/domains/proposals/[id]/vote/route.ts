import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/utils'
import { checkScoreApproval } from '@/lib/voting-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { score } = await request.json()
    if (typeof score !== 'number' || !Number.isInteger(score) || score < -2 || score > 2) {
      return NextResponse.json({ error: 'Score must be an integer between -2 and 2' }, { status: 400 })
    }

    const proposalId = params.id
    const proposal = await prisma.domainProposal.findUnique({
      where: { id: proposalId },
      include: { targetDomain: true }
    })

    if (!proposal || proposal.status !== 'PENDING') {
      return NextResponse.json({ error: 'Proposal not found or closed' }, { status: 404 })
    }

    let votingDomainId = proposal.type === 'CREATE' ? proposal.parentId : proposal.targetDomain?.parentId

    if (!votingDomainId && proposal.type === 'RENAME' && proposal.targetDomainId) {
      votingDomainId = proposal.targetDomainId
    }

    if (!votingDomainId) {
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only admins can vote on root domain creation/deletion' }, { status: 403 })
      }
    } else {
      const isExpert = await prisma.domainExpert.findFirst({
        where: { domainId: votingDomainId, userId: session.user.id }
      })
      if (!isExpert) {
        return NextResponse.json({ error: 'Only domain experts can vote on proposals' }, { status: 403 })
      }
    }

    await prisma.domainProposalVote.upsert({
      where: { proposalId_voterId: { proposalId, voterId: session.user.id } },
      update: { score },
      create: { proposalId, voterId: session.user.id, score }
    })

    const allVotes = await prisma.domainProposalVote.findMany({ where: { proposalId } })

    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'
    let result: any

    if (votingDomainId) {
      result = await checkScoreApproval(
        votingDomainId,
        allVotes.map(v => ({ voterId: v.voterId, score: v.score }))
      )
      if (result.approved) nextStatus = 'APPROVED'
      else if (result.rejected) nextStatus = 'REJECTED'
    } else {
      // Root domain actions: admin-only scoring
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      const adminSet = new Set(admins.map(a => a.id))
      const adminVotes = allVotes.filter(v => adminSet.has(v.voterId))
      const eligibleCount = admins.length
      const voterCount = adminVotes.length
      const totalScore = adminVotes.reduce((sum, v) => sum + v.score, 0)
      const totalRights = eligibleCount
      const participationMet = eligibleCount > 0 && voterCount >= eligibleCount / 2
      const threshold = totalRights / 2
      const approved = participationMet && totalScore >= threshold
      const rejected = participationMet && totalScore <= -threshold
      result = { approved, rejected, participationMet, totalScore, totalRights, voterCount, eligibleCount }
      if (approved) nextStatus = 'APPROVED'
      else if (rejected) nextStatus = 'REJECTED'
    }

    if (nextStatus !== 'PENDING') {
      await prisma.$transaction(async (tx) => {
        await tx.domainProposal.update({
          where: { id: proposalId },
          data: { status: nextStatus }
        })

        if (nextStatus === 'APPROVED') {
          if (proposal.type === 'CREATE') {
            const name = proposal.name || ''
            let slug = proposal.slug || slugify(name)

            let existing = await tx.domain.findUnique({ where: { slug } })
            let counter = 1
            while (existing) {
              slug = `${slugify(name)}-${counter}`
              existing = await tx.domain.findUnique({ where: { slug } })
              counter++
            }

            const domain = await tx.domain.create({
              data: {
                name,
                slug,
                description: proposal.description,
                parentId: proposal.parentId
              }
            })
            await tx.domainVotingShare.create({
              data: {
                domainId: domain.id,
                domainWing: 'RIGHT',
                ownerDomainId: domain.id,
                ownerWing: 'RIGHT',
                percentage: 100
              }
            })
          } else if (proposal.type === 'RENAME' && proposal.targetDomainId && proposal.name) {
            const newName = proposal.name
            const newSlug = slugify(newName)
            
            const existing = await tx.domain.findUnique({ where: { slug: newSlug } })
            if (existing && existing.id !== proposal.targetDomainId) {
              await tx.domainProposal.update({
                where: { id: proposalId },
                data: { status: 'REJECTED' }
              })
            } else {
              await tx.domain.update({
                where: { id: proposal.targetDomainId },
                data: { name: newName, slug: newSlug }
              })
            }
          } else if (proposal.type === 'DELETE' && proposal.targetDomainId) {
            const domain = await tx.domain.findUnique({
              where: { id: proposal.targetDomainId },
              select: { _count: { select: { posts: true, children: true } } }
            })
            if (domain && domain._count.posts === 0 && domain._count.children === 0) {
              await tx.domainExpert.deleteMany({ where: { domainId: proposal.targetDomainId } })
              await tx.domainVotingShare.deleteMany({ where: { domainId: proposal.targetDomainId } })
              await tx.domainVotingShare.deleteMany({ where: { ownerDomainId: proposal.targetDomainId } })
              await tx.domain.delete({ where: { id: proposal.targetDomainId } })
            } else {
              await tx.domainProposal.update({
                where: { id: proposalId },
                data: { status: 'REJECTED' }
              })
            }
          }
        }
      })
    }

    return NextResponse.json({ success: true, status: nextStatus, result })
  } catch (error) {
    console.error('Error voting on domain proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
