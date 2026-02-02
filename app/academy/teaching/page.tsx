import Link from 'next/link'
import { Header } from '@/components/Header'

export default function AcademyTeachingPage() {
  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">لوحة الممتحن</h1>
            <p className="text-site-muted mt-2">إدارة الجلسات وتقييم المتعلمين.</p>
          </div>
          <Link href="/academy" className="btn-secondary">
            العودة للأكاديمية
          </Link>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-site-text heading mb-3">الجلسات القادمة</h2>
          <div className="text-site-muted">لا توجد جلسات مجدولة بعد.</div>
        </div>
      </main>
    </div>
  )
}
