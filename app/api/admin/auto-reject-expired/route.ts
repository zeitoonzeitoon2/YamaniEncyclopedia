import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rejectExpiredProposals } from '@/lib/voting-utils'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await rejectExpiredProposals()
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Auto-reject expired proposals error:', error)
    return NextResponse.json({ error: 'Failed to reject expired proposals' }, { status: 500 })
  }
}
