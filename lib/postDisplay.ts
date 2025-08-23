// Pure client-safe utilities related to posts display

export interface PostWithVersion {
  id: string
  version?: number | null
  revisionNumber?: number | null
  status: string
  originalPost?: {
    version?: number | null
  } | null
}

/**
 * تولید شناسه نمایشی برای نمودار
 * @param post - پست با اطلاعات ورژن
 * @returns شناسه نمایشی (مثل "123" یا "123/3")
 */
export function getPostDisplayId(post: PostWithVersion): string {
  // اگر پست دارای شماره نسخه باشد (چه تایید شده چه آرشیوشده)، همان شماره نسخه نمایش داده شود
  if (post.version != null) {
    return String(post.version)
  }

  // اگر پست طرح پیشنهادی باشد یا به حالت قابل بررسی تغییر کرده باشد، شناسه ویرایش حفظ شود
  if ((post.status === 'PENDING' || post.status === 'REVIEWABLE') && post.originalPost?.version && post.revisionNumber != null) {
    return `${post.originalPost.version}/${post.revisionNumber}`
  }

  // اگر پست جدید باشد (هنوز ورژن نگرفته)
  if (post.status === 'PENDING' && !post.originalPost) {
    return 'جدید'
  }

  // حالت پیش‌فرض
  return 'نامشخص'
}