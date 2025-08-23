import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWriteStream } from 'fs'
import { mkdir, stat } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
const HEADER_KEY = 'home.headerImage'

async function ensureUploadDir() {
  try {
    await stat(UPLOAD_DIR)
  } catch {
    await mkdir(UPLOAD_DIR, { recursive: true })
  }
}

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

  await ensureUploadDir()

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

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const filename = `header-${Date.now()}.${ext}`
  const serverPath = path.join(UPLOAD_DIR, filename)

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(serverPath)
    stream.on('finish', () => resolve())
    stream.on('error', reject)
    stream.write(buffer)
    stream.end()
  })

  const publicUrl = `/uploads/${filename}`

  await prisma.setting.upsert({
    where: { key: HEADER_KEY },
    create: { key: HEADER_KEY, value: publicUrl },
    update: { value: publicUrl },
  })

  return NextResponse.json({ url: publicUrl })
}