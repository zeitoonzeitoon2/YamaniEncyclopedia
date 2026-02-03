import { createSharedPathnamesNavigation } from 'next-intl/navigation'
import { locales } from '@/i18n'

export const { Link, usePathname, useRouter, redirect } = createSharedPathnamesNavigation({ locales })
