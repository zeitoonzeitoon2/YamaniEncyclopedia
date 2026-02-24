import { prisma } from './lib/prisma';

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'c@gmail.com' },
      include: {
        domainExperts: {
          include: {
            domain: true
          }
        }
      }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log(`User ID: '${user.id}'`);
    
    const philosophyExpert = user.domainExperts.find(de => de.domain.name === 'Philosophy');
    if (philosophyExpert) {
      console.log(`Expert Entry ID: '${philosophyExpert.id}'`);
      console.log(`Expert User ID: '${philosophyExpert.userId}'`);
      console.log(`Domain ID: '${philosophyExpert.domainId}'`);
      console.log(`Match? ${user.id === philosophyExpert.userId}`);
    } else {
      console.log('User is not expert in Philosophy');
    }

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
