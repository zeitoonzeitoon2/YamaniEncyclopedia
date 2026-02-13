import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { settleExpiredInvestments } from '@/lib/voting-utils'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await settleExpiredInvestments()
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Settlement error:', error)
    return NextResponse.json({ error: 'Failed to settle investments' }, { status: 500 })
  }
}
