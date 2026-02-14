import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n'
import { prisma } from '@/lib/prisma'
import { Providers } from '../providers'
import { Header } from '@/components/Header'

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'metadata' })
  
  let logoUrl = null
  try {
    // Fetch logo from database for favicon
    const logo = await prisma.setting.findUnique({ where: { key: 'site.logo' } })
    logoUrl = logo?.value
  } catch (error) {
    console.warn('Failed to fetch logo for metadata:', error)
  }

  return {
    title: t('title'),
    description: t('description'),
    icons: logoUrl ? {
      icon: logoUrl,
      apple: logoUrl,
    } : undefined
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!locales.includes(params.locale as (typeof locales)[number])) {
    notFound()
  }

  setRequestLocale(params.locale)
  const messages = (await import(`../../messages/${params.locale}.json`)).default

  return (
    <NextIntlClientProvider locale={params.locale} messages={messages}>
      <body className="min-h-screen bg-site-bg font-sans antialiased overflow-x-hidden">
        <Providers>
          <Header />
          <main className="relative z-0">
            {children}
          </main>
        </Providers>
      </body>
    </NextIntlClientProvider>
  )
}
