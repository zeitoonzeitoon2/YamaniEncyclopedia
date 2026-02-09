export function applyFootnotes(input: string, locale: string = 'ar'): string {
  if (!input) return ''

  let content = input

  // جمع‌آوری تعریف‌های پاورقی به شکل [^id]: متن
  const definitions: Record<string, string> = {}
  const defRegex = /^\[\^([^\]]+)\]:\s*(.+)$/gm
  content = content.replace(defRegex, (_m, id: string, def: string) => {
    if (!(id in definitions)) {
      definitions[id] = def
    }
    return '' // حذف خط تعریف از بدنه
  })

  // جایگزینی ارجاع‌ها [^id] با sup لینک‌دار و نگاشت شماره ترتیبی
  const refOrder: Record<string, number> = {}
  let counter = 0
  content = content.replace(/\[\^([^\]]+)\]/g, (_m, id: string) => {
    if (!(id in refOrder)) {
      counter += 1
      refOrder[id] = counter
      if (!(id in definitions)) {
        definitions[id] = '' // اگر تعریفش بعداً نبود، خالی بگذار
      }
    }
    const n = refOrder[id]
    return `<sup id="fnref:${id}"><a href="#fn:${id}" class="text-blue-300 hover:underline align-super">${n}</a></sup>`
  })

  // اگر هیچ ارجاعی نبود، همان محتوا را برگردان
  if (Object.keys(refOrder).length === 0) return content

  // ساخت بخش انتهایی پاورقی‌ها به ترتیب ارجاعات
  const items = Object.keys(refOrder)
    .sort((a, b) => refOrder[a] - refOrder[b])
    .map((id) => {
      const n = refOrder[id]
      const def = definitions[id] || ''
      const defHtml = autoLink(def)
      return `<li id="fn:${id}" class="mt-1"><span class="text-amber-300 font-semibold me-2">${n}.</span>${defHtml} <a href="#fnref:${id}" class="no-underline text-blue-300" aria-label="رجوع">↩︎</a></li>`
    })
    .join('')

  const footnotesTitle = locale === 'fa' ? 'پاورقی‌ها' : 'الحواشي'

  const section = `
<hr class="my-4 border-amber-700/40">
<section class="footnotes text-sm text-amber-200">
  <h5 class="font-semibold text-amber-300 mb-2">${footnotesTitle}</h5>
  <ol class="list-none ms-5">
    ${items}
  </ol>
</section>`

  return content + section
}

function autoLink(text: string): string {
  if (!text) return ''
  let out = text

  // لینک به سبک Markdown: [متن](https://...)
  out = out.replace(/==([^=]+)==/g, '<mark>$1</mark>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">$1</a>')

  // URL های ساده http/https
  out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">${url}</a>`)

  // الگوی www. بدون پروتکل
  out = out.replace(/(^|[\s(])((?:www\.)[^\s<)]+)/g, (_m, pre, url) => `${pre}<a href="https://${url}" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">${url}</a>`)

  return out
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function slugifyHeading(text: string): string {
  const normalized = (text || '')
    .toLowerCase()
    .trim()
    .replace(/[ی]/g, 'ي')
    .replace(/[ک]/g, 'ك')
    .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
  const slug = normalized
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u0600-\u06FF]/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'section'
}

export function applyArticleTransforms(input: string, locale: string = 'ar'): string {
  const raw = input || ''
  const lines = raw.split(/\r?\n/)

  const used = new Set<string>()
  const uniq = (base: string) => {
    let id = base
    let n = 2
    while (used.has(id) || id === '') {
      id = base ? `${base}-${n++}` : `section-${n++}`
    }
    used.add(id)
    return id
  }

  const headings: { level: number; text: string; id: string }[] = []
  const out: string[] = []

  const renderQuote = (start: number): { html: string; next: number } => {
    let j = start
    const q: string[] = []
    while (j < lines.length && /^>/.test(lines[j])) {
      q.push(lines[j].replace(/^>\s?/, ''))
      j += 1
    }
    let first = q[0] || ''
    let t = ''
    let person = ''
    if (/^!\s*hadith\b/.test(first)) {
      t = 'hadith'
      first = first.replace(/^!\s*hadith\b\s*/, '')
    } else if (/^!\s*ayah\b/.test(first)) {
      t = 'ayah'
      first = first.replace(/^!\s*ayah\b\s*/, '')
    } else if (/^!\s*quote\b/.test(first)) {
      t = 'quote'
      // هر چه بعد از !quote: آمده متن نقل‌قول است؛ گوینده نداریم
      first = first.replace(/^!\s*quote\s*:?\s*/, '')
      person = ''
    }
    const body = [first, ...q.slice(1)].join('\n')
    const content = autoLink(body)
    const cls = t === 'ayah' ? 'q-ayah' : 'q-quote'
    const footer = person && person.trim().length > 0
      ? `<div class=\"text-xs text-amber-300 mt-1 text-right\">— ${escapeHtml(person.trim())}</div>`
      : ''
    const html = `<blockquote class=\"${cls}\" dir=\"rtl\">${content}</blockquote>${footer}`
    return { html, next: j }
  }

  let i = 0
  let sectionOpen = false
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^(#{2,4})\s+(.*)$/)
    if (m) {
      const level = m[1].length
      const text = m[2].trim()
      const id = uniq(slugifyHeading(text))
      headings.push({ level, text, id })
      if (level === 2) {
        if (sectionOpen) out.push('</div></details>')
        out.push(`<details class="group my-3 rounded-md border border-amber-700/40 bg-stone-900/30" open><summary class="cursor-pointer select-none px-3 py-2 font-semibold text-amber-200 flex items-center justify-between"><a href="#h-${id}" class="text-amber-200 no-underline text-2xl md:text-3xl" style="font-size: calc(var(--article-scale,1) * 1.75rem)">${escapeHtml(text)}</a><span class="text-amber-300 group-open:rotate-180 transition-transform">▾</span></summary><div id="h-${id}" class="px-3 py-2">`)
        sectionOpen = true
      } else if (level === 3) {
        out.push(`<h3 id="h-${id}" class="mt-3 text-amber-200 font-semibold text-xl" style="font-size: calc(var(--article-scale,1) * 1.25rem)">${escapeHtml(text)}</h3>`)
      } else {
        out.push(`<h4 id="h-${id}" class="mt-2 text-amber-200 text-lg font-medium" style="font-size: calc(var(--article-scale,1) * 1.125rem)">${escapeHtml(text)}</h4>`)
      }
      i += 1
      continue
    }
    if (/^>/.test(line)) {
      const { html, next } = renderQuote(i)
      out.push(html)
      i = next
      continue
    }

    // پردازش تگ تصویر: !image[url|caption]
    // اصلاح ریجکس برای هندل کردن کاراکترهای خاص در URL
    const imgMatch = line.match(/^!image\[([^|\]\s]+(?: [^|\]\s]+)*)(?:\|([^\]]*))?\]$/)
    if (imgMatch) {
      const url = imgMatch[1].trim()
      const caption = (imgMatch[2] || '').trim()
      const imgHtml = `
<figure class="my-6">
  <img src="${url}" alt="${escapeHtml(caption)}" class="w-full rounded-lg shadow-lg border border-amber-700/20" />
  ${caption ? `<figcaption class="mt-2 text-center text-sm text-amber-300/80 italic">${escapeHtml(caption)}</figcaption>` : ''}
</figure>`
      out.push(imgHtml)
      i += 1
      continue
    }

    out.push(autoLink(line))
    i += 1
  }
  if (sectionOpen) out.push('</div></details>')

  let toc = ''
  if (headings.length) {
    const items = headings
      .map((h) => {
        const mr = h.level === 3 ? 15 : h.level === 4 ? 30 : 0
        const size = h.level === 2 ? 'text-lg font-semibold' : h.level === 3 ? 'text-base font-medium' : 'text-sm'
        return `<li class="mb-1"><a href="#h-${h.id}" class="text-amber-200 hover:text-orange-400 hover:underline underline-offset-2 ${size}" style="margin-right:${mr}px">${escapeHtml(h.text)}</a></li>`
      })
      .join('')
    const controls = `<div style="background:#222;border:1px solid #E67E22;border-radius:8px;padding:4px;display:flex;gap:6px"><button onclick="window.__articleResize && window.__articleResize.dec && window.__articleResize.dec()" title="کوچک‌کردن" aria-label="کوچک‌کردن" style="background:#222;color:#ffd7a3;border:1px solid #E67E22;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">−</button><button onclick="window.__articleResize && window.__articleResize.inc && window.__articleResize.inc()" title="بزرگ‌کردن" aria-label="بزرگ‌کردن" style="background:#222;color:#ffd7a3;border:1px solid #E67E22;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">＋</button></div>`
    const tocTitle = locale === 'fa' ? 'فهرست مطالب' : 'المحتويات'
    const title = `<div class="mb-2 flex flex-row-reverse items-center justify-between"><span style="color:#E67E22;font-size:1.35rem">${tocTitle}</span>${controls}</div><div class="mt-1" style="border-top:1px solid #E67E22;opacity:.6"></div>`
    toc = `<nav class="relative mb-4 text-sm text-amber-200 bg-stone-900/40 border border-amber-700/40 rounded-md p-3" dir="rtl">${title}<ol class="list-none m-0 p-0 text-right" style="padding-right:20px">${items}</ol></nav>`
  }

  const body = `<div id="article-content-body" class="article-content-body" style="font-size: calc(var(--article-scale,1) * 20px)">${out.join('\n')}</div>`
  const combined = toc + body
  return applyFootnotes(combined, locale)
}