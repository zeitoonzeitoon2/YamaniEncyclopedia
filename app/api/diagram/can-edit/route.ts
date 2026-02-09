import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditDomainDiagram } from '@/lib/course-utils'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ authorized: false }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const domainId = searchParams.get('domainId') || null

    const authorized = await canEditDomainDiagram(session.user.id, domainId)

    return NextResponse.json({ authorized })
  } catch (error) {
    console.error('Error checking diagram edit permission:', error)
    return NextResponse.json({ error: 'Internal Server Error', authorized: false }, { status: 500 })
  }
}
