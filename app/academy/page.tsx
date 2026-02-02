import Link from 'next/link'
import { Header } from '@/components/Header'

export default function AcademyLandingPage() {
  return (
    <div className="min-h-screen bg-site-bg">
      <Header />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-site-text heading">الأكاديمية</h1>
            <p className="text-site-muted mt-2">
              منصّة التعليم والاختبارات للوصول إلى الامتيازات داخل شجرة البحث.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/academy/dashboard" className="btn-primary">
              لوحة المتعلم
            </Link>
            <Link href="/academy/teaching" className="btn-secondary">
              لوحة الممتحن
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-xl font-bold text-site-text heading mb-3">المجالات</h2>
            <div className="text-site-muted">لا توجد مجالات مرتبطة بالدورات بعد.</div>
          </div>
          <div className="card">
            <h2 className="text-xl font-bold text-site-text heading mb-3">الدورات</h2>
            <div className="text-site-muted">لا توجد دورات مفعلة بعد.</div>
          </div>
        </div>
      </main>
    </div>
  )
}
