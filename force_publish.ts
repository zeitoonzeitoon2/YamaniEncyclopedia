import { PrismaClient } from '@prisma/client';
import { checkScoreApproval } from './lib/voting-utils';
import { generateNextVersion } from './lib/postUtils';
import { processArticlesData } from './lib/articleUtils';

const prisma = new PrismaClient();

async function forcePublish() {
  const postId = 'cmog6ud5a0003r2revw2syqkb';
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      votes: true,
      originalPost: { select: { version: true } }
    }
  });

  if (!post) {
    console.log('Post not found');
    return;
  }

  if (post.status !== 'PENDING') {
    console.log('Post is not PENDING. Status:', post.status);
    return;
  }

  const allDomains = new Set<string>();
  if (post.domainId) allDomains.add(post.domainId);
  if (Array.isArray(post.relatedDomainIds)) {
    post.relatedDomainIds.forEach((id: any) => allDomains.add(id));
  }

  let allDomainsApproved = true;
  for (const dId of Array.from(allDomains)) {
    const domainVotes = post.votes.filter((v: any) => v.domainId === dId || (v.domainId === null && dId === post.domainId));
    const result = await checkScoreApproval(dId, domainVotes.map((v: any) => ({ voterId: v.adminId, score: v.score })), { noRejection: true });
    if (!result.approved) allDomainsApproved = false;
  }

  console.log('allDomainsApproved:', allDomainsApproved);

  if (allDomainsApproved) {
    const version = await generateNextVersion();
    console.log('Generated version:', version);

    await prisma.$transaction(async (tx) => {
      if (post.originalPostId) {
        await tx.post.update({
          where: { id: post.originalPostId },
          data: { status: 'ARCHIVED' }
        });
      }
      await tx.post.update({
        where: { id: postId },
        data: {
          status: 'APPROVED',
          version: version,
          revisionNumber: null,
        }
      });
    });

    console.log('Post successfully APPROVED and published!');
  } else {
    console.log('Post still needs votes.');
  }
}

forcePublish().catch(console.error).finally(() => prisma.$disconnect());
