// Utility functions for post version management

export interface PostWithVersion {
  id: string;
  version?: number | null;
  revisionNumber?: number | null;
  status: string;
  originalPost?: {
    version?: number | null;
  } | null;
}

// getPostDisplayId moved to postDisplay.ts (client-safe)

/**
 * تولید ورژن جدید برای نمودار منتشر شده
 * @returns ورژن جدید
 */
export async function generateNextVersion(): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  
  // پیدا کردن بیشترین شماره نسخه در بین همه پست‌هایی که نسخه دارند (بدون توجه به وضعیت)
  const lastPost = await prisma.post.findFirst({
    where: {
      version: { not: null }
    },
    orderBy: {
      version: 'desc'
    },
    select: {
      version: true
    }
  });
  
  const lastVersion = lastPost?.version || 0;
  return lastVersion + 1;
}

/**
 * تولید شماره ویرایش جدید برای طرح پیشنهادی
 * @param originalPostId - شناسه پست اصلی
 * @returns شماره ویرایش جدید
 */
export async function generateNextRevisionNumber(originalPostId: string): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  
  // پیدا کردن آخرین شماره ویرایش برای این پست اصلی
  const lastRevision = await prisma.post.findFirst({
    where: {
      originalPostId: originalPostId,
      revisionNumber: { not: null }
    },
    orderBy: {
      revisionNumber: 'desc'
    },
    select: {
      revisionNumber: true
    }
  });
  
  const lastRevisionNumber = lastRevision?.revisionNumber || 0;
  return lastRevisionNumber + 1;
}