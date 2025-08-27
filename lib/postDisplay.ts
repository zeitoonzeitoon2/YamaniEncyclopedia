// أدوات عميل آمنة تتعلّق بعرض المنشورات

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
 * توليد معرّف عرض للمخطط
 * @param post - منشور يحوي معلومات النسخة
 * @returns معرّف للعرض (مثل "123" أو "123/3")
 */
export function getPostDisplayId(post: PostWithVersion): string {
  // إذا كان للمنشور رقم نسخة (سواء مُعتمد أو مؤرشف) فاعرض رقم النسخة
  if (post.version != null) {
    return String(post.version)
  }

  // إذا كان المنشور مقترحًا جديدًا أو أصبح قابلاً للمراجعة، فاحتفظ بهوية المراجعة
  if ((post.status === 'PENDING' || post.status === 'REVIEWABLE') && post.originalPost?.version && post.revisionNumber != null) {
    return `${post.originalPost.version}/${post.revisionNumber}`
  }

  // إذا كان المنشور جديدًا (لم يحصل على نسخة بعد)
  if (post.status === 'PENDING' && !post.originalPost) {
    return 'جديد'
  }

  // الحالة الافتراضية
  return 'غير محدد'
}