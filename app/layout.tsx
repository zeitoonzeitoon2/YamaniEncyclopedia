import './globals.css'
import { getLocale } from 'next-intl/server'

export const metadata = {
  title: 'شجرة العلم - منصة للتفكير المشترك',
  description: 'نظام لإدارة المعرفة قائم على المخططات المفاهيمية',
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
