
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = 'c@gmail.com'
  
  // 1. Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
        domainExperts: {
            include: {
                domain: true
            }
        }
    }
  })
  
  if (!user) {
    console.log('User not found')
    return
  }
  
  console.log(`User: ${user.name} (${user.id}, ${user.role})`)
  console.log('Expert Domains:', user.domainExperts.map(de => `${de.domain.name} (${de.role}, ${de.wing})`).join(', '))

  // 2. Find pending proposals
  const proposals = await prisma.domainProposal.findMany({
    where: { status: 'PENDING' },
    include: {
        targetDomain: true,
        votes: true
    }
  })
  
  console.log(`\nPending Proposals: ${proposals.length}`)
  
  for (const p of proposals) {
    console.log(`\nProposal: ${p.id} (${p.type})`)
    console.log(`Target: ${p.targetDomain?.name} (ID: ${p.targetDomainId}, ParentID: ${p.targetDomain?.parentId})`)
    console.log(`ParentID in proposal: ${p.parentId}`)
    
    let votingDomainId = p.type === 'CREATE' ? p.parentId : p.targetDomain?.parentId

    if (!votingDomainId && p.type === 'RENAME' && p.targetDomainId) {
        console.log('Applying RENAME root domain special case')
        votingDomainId = p.targetDomainId
    }
    
    console.log(`Calculated Voting Domain ID: ${votingDomainId}`)
    
    if (votingDomainId) {
        const expert = await prisma.domainExpert.findFirst({
            where: {
                domainId: votingDomainId,
                userId: user.id
            }
        })
        console.log(`Is user expert of voting domain? ${!!expert}`)
        if (expert) {
            console.log(`Expert record: ${JSON.stringify(expert)}`)
        }
    } else {
        console.log('No voting domain ID derived - only ADMIN can vote')
    }
    
    const myVote = p.votes.find(v => v.voterId === user.id)
    console.log(`User vote: ${myVote ? myVote.vote : 'None'}`)
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
