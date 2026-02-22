import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { forceTerminateInvestment } from '@/lib/voting-utils'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { investmentId } = await req.json()
    if (!investmentId) {
      return NextResponse.json({ error: 'Missing investmentId' }, { status: 400 })
    }

    const result = await forceTerminateInvestment(investmentId)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Force termination error:', error)
    return NextResponse.json({ error: 'Failed to terminate investment' }, { status: 500 })
  }
}
