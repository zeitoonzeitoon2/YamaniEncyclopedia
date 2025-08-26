import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'البريد الإلكتروني', type: 'email' },
        password: { label: 'كلمة المرور', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // تطبيع البريد الإلكتروني ليكون غير حساس لحالة الأحرف مع دعم السجلات الحالية
        const rawEmail = credentials.email.trim()
        const normalizedEmail = rawEmail.toLowerCase()

        // تصحيح (DEBUG): تسجيل محاولة البحث (دون بيانات حساسة)
        try {
          console.log('Auth: lookup start', { rawEmail, normalizedEmail })
        } catch {}

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: rawEmail },
              { email: normalizedEmail },
            ],
          },
        })

        try {
          console.log('Auth: lookup result', { found: !!user, hasPass: !!user?.password, userEmail: user?.email })
        } catch {}

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        try {
          console.log('Auth: compare', { userId: user.id, ok: isPasswordValid })
        } catch {}

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      }
    })
  ],
  callbacks: {
    session: async ({ session, token }) => {
      if (session?.user) {
        session.user.id = token.sub!
        // Always refresh role from DB to reflect latest changes without requiring re-login
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true }
          })
          session.user.role = dbUser?.role || (token.role as string)
        } catch {
          session.user.role = token.role as string
        }
      }
      return session
    },
    jwt: async ({ token, user }) => {
      // On initial sign in, persist role from user object
      if (user) {
        token.role = (user as any).role
      }
      // On subsequent requests, refresh role from DB to keep token in sync
      if (!user && token?.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true }
          })
          if (dbUser?.role) {
            token.role = dbUser.role
          }
        } catch {
          // تطبيع البريد الإلكتروني ليكون غير حساس لحالة الأحرف مع دعم السجلات الحالية
          // تصحيح (DEBUG): تسجيل محاولة البحث (دون بيانات حساسة)
        }
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
}