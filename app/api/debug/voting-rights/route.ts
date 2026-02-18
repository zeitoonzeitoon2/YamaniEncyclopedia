
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateUserVotingWeight } from '@/lib/voting-utils'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  const domainName = searchParams.get('domain')
  
  if (!email || !domainName) {
    return NextResponse.json({ error: 'email and domain required' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({ where: { email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const domain = await prisma.domain.findFirst({ where: { name: domainName } })
  if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

  console.log(`[DEBUG API] Checking rights for ${email} (${user.id}) in ${domainName} (${domain.id})`)

  const [weightRight, weightLeft] = await Promise.all([
    calculateUserVotingWeight(user.id, domain.id, 'CANDIDACY', { targetWing: 'RIGHT' }),
    calculateUserVotingWeight(user.id, domain.id, 'CANDIDACY', { targetWing: 'LEFT' })
  ])

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    domain: { id: domain.id, name: domain.name },
    rights: {
      RIGHT: { weight: weightRight, canVote: weightRight > 0 },
      LEFT: { weight: weightLeft, canVote: weightLeft > 0 }
    }
  })
}
