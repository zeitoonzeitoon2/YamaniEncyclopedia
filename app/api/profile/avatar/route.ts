import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let form: FormData
    try {
      form = await request.formData()
    } catch (e: any) {
      console.error('Invalid multipart/form-data:', e)
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    const type = file.type.toLowerCase()
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: 'Only PNG/JPEG/WEBP allowed' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 })
    }
    try {
      const u = await prisma.user.update({
        where: { id: session.user.id },
        data: { avatarBytes: buf, avatarMime: type, image: `/api/profile/avatar/${session.user.id}?v=${Date.now()}` },
        select: { id: true, image: true },
      })
      return NextResponse.json({ ok: true, image: u.image })
    } catch (dbErr: any) {
      console.error('Failed to save avatar in DB:', dbErr)
      return NextResponse.json({ error: dbErr?.message || 'Internal server error' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('POST /api/profile/avatar error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}