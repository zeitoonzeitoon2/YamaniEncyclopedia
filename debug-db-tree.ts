import { prisma } from './lib/prisma';

async function main() {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        parentId: true,
        experts: {
          orderBy: [{ role: 'asc' }],
          select: {
            id: true,
            role: true,
            wing: true,
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        _count: { select: { posts: true, children: true } },
      },
    })

    const philosophy = domains.find(d => d.slug === 'philosophy');
    if (philosophy) {
        console.log('Philosophy Domain Experts:', JSON.stringify(philosophy.experts, null, 2));
        const userExpert = philosophy.experts.find(ex => ex.user.email === 'c@gmail.com');
        if (userExpert) {
            console.log('User c@gmail.com found as expert in Philosophy!');
            console.log('User ID:', userExpert.user.id);
        } else {
            console.log('User c@gmail.com NOT found in Philosophy experts.');
        }
    } else {
        console.log('Philosophy domain not found.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
