import './globals.css'
import { Providers } from './providers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

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
  const messages = await getMessages()
  const isEnglish = locale === 'en'

  return (
    <html lang={locale} dir={isEnglish ? 'ltr' : 'rtl'} suppressHydrationWarning>
      <body className={isEnglish ? 'font-latin' : 'font-sans'}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
