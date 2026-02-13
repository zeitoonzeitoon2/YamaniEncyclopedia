// تولید slug یکتا از روی عنوان
export const slugify = (text: string) => {
  const normalized = (text || '')
    .toLowerCase()
    .trim()
    // نرمال‌سازی کاراکترهای عربی به فارسی
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    // حذف نیم‌فاصله و کنترل‌های bidi
    .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
  const slug = normalized
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u0600-\u06FF]/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'item'
}
