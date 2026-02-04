// Safe client-side utilities for post display

export interface PostWithVersion {
  id: string
  version?: number | null
  revisionNumber?: number | null
  status: string
  originalPost?: {
    version?: number | null
  } | null
}

export function getPostDisplayId(post: PostWithVersion, t?: (key: string) => string): string {
  // If the post has a version number (whether approved or archived), show the version number
  if (post.version != null) {
    return String(post.version)
  }

  // If the post is a new proposal or became reviewable, keep the revision identity
  if ((post.status === 'PENDING' || post.status === 'REVIEWABLE') && post.originalPost?.version && post.revisionNumber != null) {
    return `${post.originalPost.version}/${post.revisionNumber}`
  }

  // If the post is new (hasn't received a version yet)
  if (post.status === 'PENDING' && !post.originalPost) {
    return t ? t('status.NEW') : 'New'
  }

  // Default case
  return t ? t('status.UNKNOWN') : 'Unknown'
}
