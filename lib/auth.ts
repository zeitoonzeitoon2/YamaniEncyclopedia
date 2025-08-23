import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'ایمیل', type: 'email' },
        password: { label: 'رمز عبور', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Normalize email to be case-insensitive while still supporting existing records
        const rawEmail = credentials.email.trim()
        const normalizedEmail = rawEmail.toLowerCase()

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
          // ignore and keep existing token.role
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