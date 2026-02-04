import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n'
import { Providers } from '../providers'

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'metadata' })
  return {
    title: t('title'),
    description: t('description'),
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
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  )
}
