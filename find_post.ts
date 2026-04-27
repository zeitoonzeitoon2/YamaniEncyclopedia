import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findPost() {
  const votes = await prisma.vote.findMany({
    where: { score: -8 },
    select: { postId: true }
  });
  console.log(JSON.stringify(votes));
}

findPost().catch(console.error).finally(() => prisma.$disconnect());
