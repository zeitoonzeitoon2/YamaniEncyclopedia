import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateVotingResult } from '@/lib/voting-utils'
import { slugify } from '@/lib/utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { vote } = await request.json()
    if (!['APPROVE', 'REJECT'].includes(vote)) {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 })
    }

    const proposalId = params.id
    const proposal = await prisma.domainProposal.findUnique({
      where: { id: proposalId },
      include: { targetDomain: true }
    })

    if (!proposal || proposal.status !== 'PENDING') {
      return NextResponse.json({ error: 'Proposal not found or closed' }, { status: 404 })
    }

    // Determine voting domain (parent domain, or target domain for root rename)
    let votingDomainId = proposal.type === 'CREATE' ? proposal.parentId : proposal.targetDomain?.parentId

    // Special case: If RENAME and no parent (root domain), voting happens in the domain itself
    if (!votingDomainId && proposal.type === 'RENAME' && proposal.targetDomainId) {
      votingDomainId = proposal.targetDomainId
    }

    if (!votingDomainId) {
      // Root domain actions (CREATE/DELETE) - only admin can vote
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only admins can vote on root domain creation/deletion' }, { status: 403 })
      }
    } else {
      // Check if user is expert of voting domain
      const isExpert = await prisma.domainExpert.findFirst({
        where: { domainId: votingDomainId, userId: session.user.id }
      })
      
      // Also check if the expert is in the RIGHT wing. Only RIGHT wing experts can vote on proposals.
      if (!isExpert || isExpert.wing !== 'RIGHT') {
        console.warn('Vote rejected: User is not RIGHT wing expert of voting domain', {
            userId: session.user.id,
            votingDomainId,
            proposalId,
            userRole: session.user.role,
            isExpert: !!isExpert,
            expertWing: isExpert?.wing
        })
        return NextResponse.json({ error: 'Only RIGHT wing experts can vote on domain proposals' }, { status: 403 })
      }
    }

    // Record vote
    await prisma.domainProposalVote.upsert({
      where: { proposalId_voterId: { proposalId, voterId: session.user.id } },
      update: { vote },
      create: { proposalId, voterId: session.user.id, vote }
    })

    // Calculate result
    const allVotes = await prisma.domainProposalVote.findMany({
      where: { proposalId }
    })

    // Use DIRECT voting on the parent domain
    const { approvals, rejections } = await calculateVotingResult(
      allVotes,
      votingDomainId || '', // If no votingDomainId, calculateVotingResult might fail or return 0
      'DIRECT'
    )

    const threshold = 50
    let nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING'

    if (approvals > threshold) nextStatus = 'APPROVED'
    else if (rejections >= threshold) nextStatus = 'REJECTED'

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

            // Ensure slug uniqueness
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
            // Initialize shares
            // 100% of shares initially in the hands of the Right Wing (of Self)
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
            
            // Check slug uniqueness
            const existing = await tx.domain.findUnique({ where: { slug: newSlug } })
            if (existing && existing.id !== proposal.targetDomainId) {
              // Mark as rejected if slug conflict
              await tx.domainProposal.update({
                where: { id: proposalId },
                data: { status: 'REJECTED' } // Could add reason field later
              })
            } else {
              await tx.domain.update({
                where: { id: proposal.targetDomainId },
                data: {
                  name: newName,
                  slug: newSlug
                }
              })
            }
          } else if (proposal.type === 'DELETE' && proposal.targetDomainId) {
            // Check dependencies before deleting
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
              // Mark as rejected if dependencies exist at execution time
              await tx.domainProposal.update({
                where: { id: proposalId },
                data: { status: 'REJECTED' }
              })
            }
          }
        }
      })
    }

    return NextResponse.json({ success: true, status: nextStatus })
  } catch (error) {
    console.error('Error voting on domain proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
