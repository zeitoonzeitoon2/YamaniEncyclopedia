
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'f@gmail.com' },
  })

  if (!user) {
    console.log('User f@gmail.com not found')
    return
  }

  const candidacies = await prisma.expertCandidacy.findMany({
    where: {
      candidateUserId: user.id,
      status: 'PENDING'
    },
    include: {
      candidateUser: true
    }
  })

  console.log(`Found ${candidacies.length} pending candidacies for f@gmail.com`)

  for (const c of candidacies) {
    console.log(`Deleting candidacy ${c.id} (Score: ${c.totalScore}) for ${c.candidateUser.email}`)
    await prisma.expertCandidacy.delete({
      where: { id: c.id }
    })
    console.log('Deleted.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
