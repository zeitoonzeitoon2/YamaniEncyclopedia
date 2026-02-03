import { getRequestConfig } from 'next-intl/server'

export const locales = ['ar', 'fa', 'en'] as const
export const defaultLocale = 'ar'

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = locales.includes(locale as (typeof locales)[number]) ? locale : defaultLocale

  return {
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
  }
})
