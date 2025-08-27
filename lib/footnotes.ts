export function applyFootnotes(input: string): string {
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

  const section = `
<hr class="my-4 border-amber-700/40">
<section class="footnotes text-sm text-amber-200">
  <h5 class="font-semibold text-amber-300 mb-2">الحواشي</h5>
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
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">$1</a>')

  // URL های ساده http/https
  out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">${url}</a>`)

  // الگوی www. بدون پروتکل
  out = out.replace(/(^|[\s(])((?:www\.)[^\s<)]+)/g, (_m, pre, url) => `${pre}<a href="https://${url}" target="_blank" rel="noopener noreferrer" class="text-blue-300 underline hover:text-blue-200">${url}</a>`)

  return out
}