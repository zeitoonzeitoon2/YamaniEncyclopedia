import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const HEADER_KEY = 'home.headerImage'

export async function GET() {
  const setting = await prisma.setting.findUnique({ where: { key: HEADER_KEY } })
  return NextResponse.json({ url: setting?.value || null })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'فایل ارسال نشده است' }, { status: 400 })
  }

  // محدودیت‌ها
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB
  if ((file as any).size > MAX_SIZE) {
    return NextResponse.json({ error: 'حجم فایل باید حداکثر 5 مگابایت باشد' }, { status: 400 })
  }

  // ذخیره به صورت Data URL در پایگاه داده (سازگار با محیط‌های Read-only مثل Netlify)
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mime = (file as any).type || 'image/jpeg'
  const dataUrl = `data:${mime};base64,${base64}`

  await prisma.setting.upsert({
    where: { key: HEADER_KEY },
    create: { key: HEADER_KEY, value: dataUrl },
    update: { value: dataUrl },
  })

  return NextResponse.json({ url: dataUrl })
}