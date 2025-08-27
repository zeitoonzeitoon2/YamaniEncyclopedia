export const dynamic = 'force-dynamic'

import { PostCard } from '@/components/PostCard'
import { prisma } from '@/lib/prisma'
import { Header } from '@/components/Header'
import Image from 'next/image'

async function getTopPost() {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/posts/top`, {
      cache: 'no-store'
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.error('Error fetching top post:', error)
    return null
  }
}

export default async function HomePage() {
  const topVotedPost = await getTopPost()

  // به صورت امن مقدار هدر را بخوانیم تا اگر مدل Setting موجود نبود خطا ندهد
  let headerUrl: string | null = null
  try {
    const headerSetting = await (prisma as any).setting?.findUnique?.({ where: { key: 'home.headerImage' } })
    headerUrl = headerSetting?.value || null
  } catch (err) {
    console.warn('[HomePage] Setting model not available yet, skipping header image.')
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        {/* لافتة الرأس */}
        {headerUrl && (
          <div className="relative h-48 md:h-64 lg:h-80 mb-8">
            <Image src={headerUrl} alt="رأس الصفحة" fill className="object-cover rounded-xl" priority unoptimized />
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6 text-dark-text">المخطط الأبرز</h1>
        <div className="mb-12">
          {topVotedPost ? (
            <PostCard post={topVotedPost as any} fullWidth={true} hideArticleLinkInputs={true} hideAuthorName={true} />
          ) : (
            <p className="text-dark-muted">لا توجد منشورات بعد.</p>
          )}
        </div>

        {/* بخش معرفی سایت */}
        <section className="mb-10">
          <div className="card rounded-xl p-6 md:p-8 space-y-4">
            <h2 className="text-2xl md:text-3xl font-extrabold text-warm-accent">حول «شجرة العلم»</h2>
            <p className="text-white leading-8">
              «شجرة العلم» منصة للتفكير المشترك وتوظيف قوة العقل الجمعي بهدف تنمية المعرفة المبنية على الحكمة اليمانية وعلوم قائم آل محمد(ع). في هذه المنصة يطوّر الباحثون معًا، تحت إشراف المشرفين، مخططًا معرفيًا معقدًا.
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">لماذا «شجرة العلم» مهمة؟</h3>
            <p className="text-white leading-7">
              في عالم نواجه فيه انفجار البيانات، لا شيء أهم من الموثوقية والدقة والعمق. نسعى في هذه المنصة إلى أن يشرف على تطور المعرفة نخبة علمية تتمتع بالعمق والبصيرة والالتزام بتعاليم الدعوة اليمانية(ع)، وهذا سيكون أبرز مزايا المنصة.
            </p>
            <p className="text-white leading-7">
              كما أن أساس هذه الموسوعة الشجريّة هو تنظيم وترتيب المفاهيم والمواد العلمية بحيث يكون لكل مفهوم ومقال موضعه الصحيح ضمن المنظومة.
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">البنية</h3>
            <ul className="text-white leading-7 space-y-1 list-disc pr-6">
              <li>يمكن للجميع المشاركة في هذا المشروع بالتسجيل كمحرر.</li>
              <li>في صفحة التحرير الجديد يمكنك حذف أو إضافة العقد، أو حذف/إضافة/تحرير البطاقات، كما يمكنك ربط المقالات بالبطاقات أو تحرير المقالات الموجودة.</li>
              <li>وإذا شعرت بوجود علاقة مفهومية بين العقد، يمكنك إضافة العقد المرتبطة في قسم «مرتبط بـ» في نهاية البطاقة.</li>
              <li>المقترحات تحصل على معرّف عشري وتُرسل إلى لوحة المشرفين.</li>
              <li>في النهاية، يعاين المشرفون في لوحتهم المقترحات، وبعد المقارنة البصرية والنقاش في التعليقات، يمنحونها التقييم.</li>
              <li>إذا بلغت التقييمات النصاب، أي نصف عدد المشرفين، وشارُّك في التصويت على الأقل نصفهم، تُنشر الخطة وتتلقى معرّفًا جديدًا.</li>
              <li>إذا أُدخلت عدة تعديلات على إصدار واحد وتوفرت شروط النشر لاثنين أو أكثر، يُنشر أول مقترح نال الأصوات وتُعلَّم البقية بوسم «قابل للمراجعة»، ثم يُطلب من المحررين إعادة تطبيق أفكارهم على الإصدار المنشور الجديد وإرساله.</li>
              <li>هذه المنصة في تطور مستمر، وبعون الله ستُضاف إليها مزيد من الإمكانات.</li>
            </ul>
          </div>
        </section>

        {/* توضيح أسفل الصفحة */}
        <div className="mt-12 border-t border-dark-border pt-6 text-sm text-dark-muted">
          <p>
            فَبَشِّرْ عِبَادِ · الَّذِينَ يَسْتَمِعُونَ الْقَوْلَ فَيَتَّبِعُونَ أَحْسَنَهُ أُولَئِكَ الَّذِينَ هَدَاهُمُ اللَّهُ وَأُولَئِكَ هُمْ أُولُو الْأَلْبَابِ (زمر: 17،18)
          </p>
        </div>
      </div>
    </>
  )
}