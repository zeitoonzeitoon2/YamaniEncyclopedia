import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // ایجاد جدول ExamSession اگر وجود ندارد و اضافه کردن ستون‌های لازم
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

    // اضافه کردن ستون courseId اگر قبلاً اضافه نشده (برای اطمینان)
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ExamSession" ADD COLUMN "courseId" TEXT;`).catch(() => {});
    } catch (e) {}

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
