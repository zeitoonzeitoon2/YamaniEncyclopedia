import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'شجرة العلم - منصة للتفكير المشترك',
  description: 'نظام لإدارة المعرفة قائم على المخططات المفاهيمية',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}