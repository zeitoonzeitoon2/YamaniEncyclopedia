import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'درخت علم - پلتفرم هم اندیشی',
  description: 'سامانهٔ مدیریت دانش مبتنی بر نمودارهای مفهومی',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body className="font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}