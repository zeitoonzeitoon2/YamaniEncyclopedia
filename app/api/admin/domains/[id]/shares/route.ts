import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const domainId = params.id

    // Get shares where this domain is the base domain (who has power here?)
    const sharesInDomain = await prisma.domainVotingShare.findMany({
      where: { domainId },
      include: {
        ownerDomain: {
          select: { id: true, name: true, slug: true }
        },
        domain: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { percentage: 'desc' }
    })

    // Get shares where this domain is the owner (where do we have power?)
    const ownedShares = await prisma.domainVotingShare.findMany({
      where: { ownerDomainId: domainId },
      include: {
        domain: {
          select: { id: true, name: true, slug: true }
        },
        ownerDomain: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { percentage: 'desc' }
    })

    return NextResponse.json({
      sharesInDomain,
      ownedShares
    })
  } catch (error) {
    console.error('Error fetching domain shares:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
