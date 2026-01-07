const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const rootDomain = await prisma.domain.upsert({
    where: { slug: 'philosophy' },
    update: { name: 'Philosophy' },
    create: { name: 'Philosophy', slug: 'philosophy' },
    select: { id: true },
  })

  await prisma.post.updateMany({
    where: { domainId: null },
    data: { domainId: rootDomain.id },
  })

  const supervisorsAndAdmins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERVISOR'] } },
    select: { id: true, role: true },
  })

  await Promise.all(
    supervisorsAndAdmins.map((u) =>
      prisma.domainExpert.upsert({
        where: { userId_domainId: { userId: u.id, domainId: rootDomain.id } },
        update: { role: u.role === 'ADMIN' ? 'HEAD' : 'EXPERT' },
        create: { userId: u.id, domainId: rootDomain.id, role: u.role === 'ADMIN' ? 'HEAD' : 'EXPERT' },
        select: { id: true },
      })
    )
  )
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    await prisma.$disconnect()
    throw e
  })

