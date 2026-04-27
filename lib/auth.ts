import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
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
        

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: rawEmail },
              { email: normalizedEmail },
            ],
          },
        })

        

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        

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
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    signIn: async ({ user, account }) => {
      if (account?.provider === 'google') {
        const { email, name, image } = user
        if (!email) return false

        try {
          const dbUser = await prisma.user.findUnique({
            where: { email },
          })

          if (!dbUser) {
            // Create user if not exists
            await prisma.user.create({
              data: {
                email,
                name: name || email.split('@')[0],
                image,
                role: 'USER',
              },
            })
          }
          return true
        } catch (error) {
          console.error('Error in Google signIn callback:', error)
          return false
        }
      }
      return true
    },
    session: async ({ session, token }) => {
      if (session?.user) {
        session.user.id = token.sub!
        // Always refresh role from DB to reflect latest changes without requiring re-login
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, image: true, name: true }
          })
          session.user.role = dbUser?.role || (token.role as string)
          if (typeof dbUser?.image === 'string') session.user.image = dbUser.image
          if (typeof dbUser?.name === 'string') session.user.name = dbUser.name
        } catch {
          session.user.role = token.role as string
        }
      }
      return session
    },
    jwt: async ({ token, user }) => {
      // On initial sign in, persist role and ID from DB to the token
      if (user) {
        // If this is a Google login (or any non-credentials login where user comes from provider)
        // we need to find our internal DB user to get the correct internal ID
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          select: { id: true, role: true }
        })
        
        if (dbUser) {
          token.sub = dbUser.id
          token.role = dbUser.role
        } else {
          // Fallback if user somehow not found yet
          token.role = (user as any).role || 'USER'
        }
      } else if (token?.sub) {
        // On subsequent requests, refresh role from DB to keep token in sync
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { role: true }
          })
          if (dbUser?.role) {
            token.role = dbUser.role
          }
        } catch {
          // Silent fallback
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