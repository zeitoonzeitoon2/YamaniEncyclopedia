import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedName = String(name || '').trim()

    if (!normalizedName || !normalizedEmail || !password) {
      return NextResponse.json(
        { message: 'تمام فیلدها الزامی هستند' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' },
        { status: 400 }
      )
    }

    // التحقق مما إذا كان المستخدم موجودًا مسبقًا
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      return NextResponse.json(
        { message: 'کاربری با این ایمیل قبلاً ثبت نام کرده است' },
        { status: 400 }
      )
    }

    // تجزئة كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12)

    // إنشاء المستخدم
    const user = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'USER'
      }
    })

    // إزالة كلمة المرور من الاستجابة
    const { password: _, ...userWithoutPassword } = user as any

    return NextResponse.json(
      {
        message: 'حساب کاربری با موفقیت ایجاد شد',
        user: userWithoutPassword
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    // معالجة انتهاك القيد الفريد بشكل صريح
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { message: 'این ایمیل قبلاً استفاده شده است' },
        { status: 400 }
      )
    }

    console.error('Registration error:', error)
    return NextResponse.json(
      { message: 'خطا در ایجاد حساب کاربری' },
      { status: 500 }
    )
  }
}