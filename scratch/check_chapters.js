const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const chapters = await prisma.courseChapter.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, title: true, version: true, originalChapterId: true, courseId: true }
  })
  console.log(JSON.stringify(chapters, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
