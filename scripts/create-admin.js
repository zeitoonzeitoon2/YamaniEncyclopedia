const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
  const prisma = new PrismaClient();
  const email = 'h@gmail.com';
  const name = 'h@gmail.com';
  const plainPassword = 'h@gmail.com';

  try {
    const passwordHash = bcrypt.hashSync(plainPassword, 12);

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { email },
        data: { name, password: passwordHash, role: 'ADMIN' },
      });
      console.log('Updated existing user to ADMIN (password reset).');
    } else {
      user = await prisma.user.create({
        data: { email, name, password: passwordHash, role: 'ADMIN' },
      });
      console.log('Created new ADMIN user.');
    }

    console.log({ id: user.id, email: user.email, role: user.role });
  } catch (e) {
    console.error('Error creating/updating admin:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();