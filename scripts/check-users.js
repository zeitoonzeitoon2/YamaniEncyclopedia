const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: ['a@gmail.com', 'c@gmail.com'] } },
    select: { email: true, role: true }
  });
  console.log('Users:', users);

  const experts = await prisma.domainExpert.findMany({
    where: { user: { email: { in: ['a@gmail.com', 'c@gmail.com'] } } },
    include: { domain: { select: { name: true } } }
  });
  console.log('Experts:', experts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
