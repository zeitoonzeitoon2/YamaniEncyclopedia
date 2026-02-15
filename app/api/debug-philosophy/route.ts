import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
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
