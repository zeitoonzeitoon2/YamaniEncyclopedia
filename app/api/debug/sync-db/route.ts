import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // ایجاد جدول ExamSession با تمام ستون‌های مورد نیاز
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ExamSession" (
        "id" TEXT NOT NULL,
        "courseId" TEXT NOT NULL,
        "studentId" TEXT NOT NULL,
        "examinerId" TEXT,
        "meetLink" TEXT,
        "scheduledAt" TIMESTAMP(3),
        "status" TEXT NOT NULL DEFAULT 'REQUESTED',
        "score" INTEGER,
        "feedback" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
      );
    `)

    // اطمینان از وجود تک تک ستون‌ها (اگر جدول از قبل ناقص ساخته شده باشد)
    const columns = [
      'ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "courseId" TEXT',
      'ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "score" INTEGER',
      'ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "feedback" TEXT',
      'ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "meetLink" TEXT',
      'ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3)'
    ]

    for (const sql of columns) {
      try {
        await prisma.$executeRawUnsafe(sql).catch(() => {})
      } catch (e) {}
    }

    return NextResponse.json({ 
      success: true, 
      message: "ساختار دیتابیس با موفقیت بروزرسانی شد. حالا می‌توانید درخواست آزمون بدهید." 
    })
  } catch (error: any) {
    console.error('Database sync error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
