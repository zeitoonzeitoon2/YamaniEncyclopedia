import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'ADMIN'
    const isDev = process.env.NODE_ENV !== 'production'
    if (!isDev && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const philosophy = await prisma.domain.findUnique({
      where: { slug: 'philosophy' },
      include: {
        experts: {
          include: {
            user: {
              select: {
                email: true,
                role: true
              }
            }
          }
        }
      }
    })
    
    return NextResponse.json({ philosophy })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
