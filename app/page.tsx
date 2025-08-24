export const dynamic = 'force-dynamic'

import { PostCard } from '@/components/PostCard'
import { prisma } from '@/lib/prisma'
import { Header } from '@/components/Header'
import Image from 'next/image'

// کمکی: گرفتن پست با بیشترین امتیاز مثبت (در صورت نبود، آخرین پست منتشرشده)
async function getTopVotedPost() {
  try {
    const posts = await prisma.post.findMany({
      where: { status: 'APPROVED', version: { not: null } },
      include: {
        author: { select: { name: true, image: true } },
        votes: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const postsWithScores = posts
      .filter((p) => p.votes.length > 0)
      .map((p) => ({ ...p, totalScore: p.votes.reduce((s, v) => s + v.score, 0) }))
      .filter((p) => p.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)

    const topByScore = postsWithScores[0] ?? null
    if (topByScore) return topByScore

    // اگر پست با رای مثبت وجود ندارد، آخرین پست APPROVED را به عنوان fallback برگردان
    if (posts.length > 0) {
      const p = posts[0]
      const pTotal = p.votes.reduce((s, v) => s + v.score, 0)
      return { ...p, totalScore: pTotal }
    }

    return null
  } catch (err) {
    console.error('[HomePage.getTopVotedPost] Failed to fetch from Prisma:', err)
    return null
  }
}

export default async function HomePage() {
  const topVotedPost = await getTopVotedPost()

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
        {/* Header banner */}
        {headerUrl && (
          <div className="relative h-48 md:h-64 lg:h-80 mb-8">
            <Image src={headerUrl} alt="Header" fill className="object-cover rounded-xl" priority />
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6 text-dark-text">نمودار برتر</h1>
        <div className="mb-12">
          {topVotedPost ? (
            <PostCard post={topVotedPost as any} fullWidth={true} hideArticleLinkInputs={true} hideAuthorName={true} />
          ) : (
            <p className="text-dark-muted">هنوز پستی ثبت نشده است.</p>
          )}
        </div>

        {/* بخش معرفی سایت */}
        <section className="mb-10">
          <div className="card rounded-xl p-6 md:p-8 space-y-4">
            <h2 className="text-2xl md:text-3xl font-extrabold text-warm-accent">درباره «درخت علم»</h2>
            <p className="text-white leading-8">
              «درخت علم» پلتفرمی برای هم اندیشی و به کارگیری قدرت خرد جمعی به هدف توسعه دانش مبتنی بر حکمت یمانی و علوم قائم آل محمد(ع) است. در این پلتفرم پژوهشگران با همفکری تحت اشراف ناظران یک نمودار پیچیده دانش را توسعه و ارتقا می دهند.
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">چرا «درخت علم» مهم است؟</h3>
            <p className="text-white leading-7">
              در جهانی که ما با انفجار داده ها روبرو هستیم هیچ چیز مهم تر از اعتبار و دقت و عمق نیست. در این پلتفرم سعی بر این است که یک گروه علمی برگزیده که از عمق و بصیرت و پایبندی به آموزه های دعوت یمانی(ع) برخوردار هستند بر این فرگشت دانش نظارت کنند و این مهمترین مزیت این پلتفرم خواهد بود.
            </p>
            <p className="text-white leading-7">
              از طرفی مبنای این دانشنامه درختی بر نظم و سامان دادن به مفاهیم و مطالب علمی خواهد بود به این هدف که هر مفهوم و مقاله ای در این منظومه در جایگاه درستش قرار بگیرد.
            </p>
            <h3 className="text-xl font-bold text-warm-accent mt-2">ساختار</h3>
            <ul className="text-white leading-7 space-y-1 list-disc pr-6">
              <li>همه می توانند با ثبت نام به عنوان یک ویرایشگر در این پروژه مشارکت کنند.</li>
              <li>در صفحه ویرایش جدید می توانید گره ها را حذف یا اضافه کنید یا فلش کارت ها را حذف یا اضافه یا ویرایش کنید و می توانید به فلش کارت ها مقالاتی را لینک کنید یا مقالات موجود را ویرایش کنید.</li>
              <li>همچنین اگر بین گره ها ارتباط مفهومی را احساس می کنید می توانید در بخش «مرتبط است با» گره های مرتبط را به انتهای فلش کارت اضافه کنید.</li>
              <li>طرح های پیشنهادی شناسه اعشاری می گیرند و به داشبورد ناظران فرستاده می شوند.</li>
              <li>در نهایت ناظران در داشبورد خود طرح های پیشنهادی را ملاحظه می کنند و پس از مقایسه بصری و گفتگو و بحث در کامنت ها، به آنها امتیاز می دهند.</li>
              <li>اگر امتیازها به حد نصاب یعنی نصف تعداد ناظران برسند و اقلا نیمی از ناظران در این رای گیری مشارکت کرده باشند آن طرح منتشر می شود و شناسه جدید دریافت می کند.</li>
              <li>اگر به یک نسخه چند ویرایش وارد شده باشد و دو یا چند ویرایش واجد شرایط انتشار شوند اولین طرحی که رای آورده منتشر می شود و طرح های دیگر برچسب قابل بررسی می خورند. آنگاه از ویرایشگرانی که این طرح ها را مطرح کرده اند خواسته می شود که ایده های خود را روی طرح منتشر شده جدید دوباره اعمال کنند و بفرستند.</li>
              <li>این پلتفرم مدام در حال تکامل خواهد بود و به یاری خدا امکانات بیشتری به آن اضافه خواهند شد.</li>
            </ul>
          </div>
        </section>

        {/* توضیح پایین صفحه */}
        <div className="mt-12 border-t border-dark-border pt-6 text-sm text-dark-muted">
          <p>
            فَبَشِّرْ عِبَادِ · الَّذِينَ يَسْتَمِعُونَ الْقَوْلَ فَيَتَّبِعُونَ أَحْسَنَهُ أُولَئِكَ الَّذِينَ هَدَاهُمُ اللَّهُ وَأُولَئِكَ هُمْ أُولُو الْأَلْبَابِ (زمر: 17،18)
          </p>
        </div>
      </div>
    </>
  )
}