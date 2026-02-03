import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n'

export const metadata = {
  title: 'شجرة العلم - منصة للتفكير المشترك',
  description: 'نظام لإدارة المعرفة قائم على المخططات المفاهيمية',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default function RootLayout({
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

  return children
}
