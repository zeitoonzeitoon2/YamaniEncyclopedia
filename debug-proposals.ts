import { prisma } from './lib/prisma';

async function main() {
  try {
    const proposals = await prisma.domainProposal.findMany({
      where: { status: 'PENDING' },
      include: {
        targetDomain: {
          select: { id: true, name: true, parentId: true }
        }
      }
    });
    
    console.log('Pending Proposals:', JSON.stringify(proposals, null, 2));
    
    // Also check c@gmail.com user
    const user = await prisma.user.findFirst({
        where: { email: 'c@gmail.com' },
        include: {
            domainExperts: {
                include: {
                    domain: {
                        select: { id: true, name: true, parentId: true }
                    }
                }
            }
        }
    });
    console.log('User c@gmail.com:', JSON.stringify(user, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
