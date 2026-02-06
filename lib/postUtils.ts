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

export async function generateNextVersion(): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  
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

export async function generateNextRevisionNumber(originalPostId: string): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  
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

export async function getTopVotedApprovedPost() {
  const { prisma } = await import('@/lib/prisma');

  // Fetch only the 50 most recent approved posts to find the top voted one
  const posts = await prisma.post.findMany({
    where: { status: 'APPROVED', version: { not: null } },
    include: {
      author: { select: { name: true, image: true } },
      votes: true,
      originalPost: { select: { version: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const postsWithScores = posts
    .filter(p => p.votes.length > 0)
    .map(p => ({ ...p, totalScore: p.votes.reduce((s, v) => s + v.score, 0) }))
    .filter(p => p.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore);

  const topByScore = postsWithScores[0] ?? null;
  if (topByScore) return topByScore;

  if (posts.length > 0) {
    const p = posts[0];
    const total = p.votes.reduce((s, v) => s + v.score, 0);
    return { ...p, totalScore: total };
  }

  return null;
}
