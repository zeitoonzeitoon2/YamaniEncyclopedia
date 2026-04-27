import { PrismaClient } from '@prisma/client';
import { checkScoreApproval } from './lib/voting-utils';

const prisma = new PrismaClient();

async function main() {
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

  console.log('Post status:', post.status);

  const allDomains = new Set<string>();
  if (post.domainId) allDomains.add(post.domainId);
  if (Array.isArray(post.relatedDomainIds)) {
    post.relatedDomainIds.forEach((id: any) => allDomains.add(id));
  }

  let allDomainsApproved = true;
  for (const dId of Array.from(allDomains)) {
    const domainVotes = post.votes.filter((v: any) => v.domainId === dId || (v.domainId === null && dId === post.domainId));
    console.log(`Checking domain ${dId} with ${domainVotes.length} votes`);
    
    const result = await checkScoreApproval(dId, domainVotes.map((v: any) => ({ voterId: v.adminId, score: v.score })), { noRejection: true });
    console.log(`Result for ${dId}:`, result);
    if (!result.approved) allDomainsApproved = false;
  }

  console.log('Final isApproved:', allDomainsApproved);
}

main().catch(console.error).finally(() => prisma.$disconnect());
