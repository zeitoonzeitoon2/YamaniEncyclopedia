import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n'
import { prisma } from '@/lib/prisma'
import { Providers } from '../providers'
import { Header } from '@/components/Header'
import { DevUserSwitcher } from '@/components/DevUserSwitcher'

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'metadata' })
  
  let logoUrl = null
  /*
  try {
    // Fetch logo from database for favicon with 2s timeout
    const logoPromise = prisma.setting.findUnique({ where: { key: 'site.logo' } })
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 2000))
    
    const logo = await Promise.race([logoPromise, timeoutPromise]) as any
    logoUrl = logo?.value
  } catch (error) {
    console.warn('Failed to fetch logo for metadata:', error)
  }
  */

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
      <div className="min-h-screen bg-site-bg font-sans antialiased overflow-x-hidden">
        <Providers>
          <Header />
          <main className="relative z-0 container mx-auto px-4 py-6">
            {children}
          </main>
          <DevUserSwitcher />
        </Providers>
      </div>
    </NextIntlClientProvider>
  )
}
