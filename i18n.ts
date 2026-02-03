import { getRequestConfig } from 'next-intl/server'

export const locales = ['ar', 'fa', 'en'] as const
export const defaultLocale = 'ar'

export default getRequestConfig(async ({ locale }) => {
  const candidateLocale = locale ?? defaultLocale
  const resolvedLocale = locales.includes(candidateLocale as (typeof locales)[number]) ? candidateLocale : defaultLocale

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
  }
})
