import './globals.css'
import { getLocale } from 'next-intl/server'
import { prisma } from '@/lib/prisma'

import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export async function generateMetadata() {
  const logoUrl = null

  return {
    title: 'شجرة العلم - منصة للتفكير المشترك',
    description: 'نظام لإدارة المعرفة قائم على المخططات المفاهيمية',
    icons: logoUrl ? {
      icon: logoUrl,
      apple: logoUrl,
    } : undefined
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const isEnglish = locale === 'en'

  return (
    <html lang={locale} dir={isEnglish ? 'ltr' : 'rtl'} suppressHydrationWarning>
      <body className={isEnglish ? 'font-latin' : 'font-sans'}>{children}</body>
    </html>
  )
}
