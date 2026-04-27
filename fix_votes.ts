import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixVotes() {
  const postId = 'cmoemtpjh0002keovxnycptjs';
  
  const votes = await prisma.vote.findMany({
    where: { postId }
  });

  console.log(`Found ${votes.length} votes for post ${postId}`);

  for (const vote of votes) {
    const expert = await prisma.domainExpert.findFirst({
      where: { userId: vote.adminId, domainId: vote.domainId || undefined }
    });

    if (expert) {
        const multiplier = expert.role === 'HEAD' ? 2 : 1;
        const scaledMultiplier = multiplier * 2;
        
        if (vote.score % scaledMultiplier === 0) {
            const rawScore = vote.score / scaledMultiplier;
            console.log(`Updating vote for user ${vote.adminId}: ${vote.score} -> ${rawScore}`);
            await prisma.vote.update({
                where: { id: vote.id },
                data: { score: rawScore }
            });
        } else {
            // If it's not perfectly divisible, maybe it was already fixed or different
             console.log(`Skipping vote for user ${vote.adminId}: ${vote.score} (not divisible by ${scaledMultiplier})`);
        }
    }
  }
}

fixVotes().catch(console.error).finally(() => prisma.$disconnect());
