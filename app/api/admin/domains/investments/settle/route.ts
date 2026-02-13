import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { settleExpiredInvestments } from '@/lib/voting-utils'

export async function POST() {
  const session = await auth()
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
