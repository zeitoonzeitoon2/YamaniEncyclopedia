
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Replicate the types and logic from admin/page.tsx
type DomainUser = {
  id: string
  name: string | null
  email: string | null
  role: string
}

type DomainExpert = {
  id: string
  role: string
  wing: string
  user: DomainUser
}

type DomainNode = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  experts: DomainExpert[]
  counts: { posts: number; children: number }
  children: DomainNode[]
}

// Replicate findDomainById
function findDomainById(roots: DomainNode[], id: string): DomainNode | null {
  const stack: DomainNode[] = [...roots]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur.id === id) return cur
    for (const c of cur.children) stack.push(c)
  }
  return null
}

// Replicate buildTree (simplified, assuming we get flat list and build it)
function buildTree(rows: any[]): DomainNode[] {
  const byId: Record<string, DomainNode> = {}
  const all: DomainNode[] = new Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    // Ensure experts are mapped correctly
    const experts = r.experts.map((e: any) => ({
        id: e.id,
        role: e.role,
        wing: e.wing,
        user: {
            id: e.user.id,
            name: e.user.name,
            email: e.user.email,
            role: e.user.role
        }
    }))
    
    const node: DomainNode = { 
        id: r.id, 
        name: r.name, 
        slug: r.slug, 
        description: r.description, 
        parentId: r.parentId,
        experts,
        counts: { posts: 0, children: 0 }, // Mock counts
        children: [] 
    }
    byId[node.id] = node
    all[i] = node
  }

  const roots: DomainNode[] = []
  for (let i = 0; i < all.length; i++) {
    const node = all[i]
    const pid = node.parentId
    if (pid) {
      const parent = byId[pid]
      if (parent) parent.children.push(node)
      else roots.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

async function run() {
  // 1. Fetch User
  const userEmail = 'c@gmail.com'
  const user = await prisma.user.findFirst({ where: { email: userEmail } })
  if (!user) {
    console.error('User not found')
    return
  }
  console.log('User:', user.id, user.email)

  // 2. Fetch Domains (simulate API)
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
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    })
  
  const roots = buildTree(domains)
  console.log('Tree built with', roots.length, 'roots')

  // 3. Fetch Pending Proposals
  const proposals = await prisma.domainProposal.findMany({
    where: { status: 'PENDING' },
    include: {
      targetDomain: { select: { name: true, parentId: true } },
      proposer: { select: { name: true, email: true } },
      votes: true
    }
  })

  console.log('Pending Proposals:', proposals.length)

  // 4. Simulate canVoteOnProposal
  const canVoteOnProposal = (p: any, sessionUser: any, roots: DomainNode[], selectedDomain: DomainNode | null) => {
    if (!sessionUser) return false
    if (sessionUser.role === 'ADMIN') return true
    
    let votingDomainId = p.type === 'CREATE' ? p.parentId : p.targetDomain?.parentId

    if (!votingDomainId && p.type === 'RENAME' && p.targetDomainId) {
      votingDomainId = p.targetDomainId
    }

    if (!votingDomainId) {
        console.log('No votingDomainId determined')
        return false 
    }
    
    const votingDomain = (selectedDomain?.id === votingDomainId) ? selectedDomain : findDomainById(roots, votingDomainId)
    if (!votingDomain) {
      console.log('Voting domain not found:', votingDomainId)
      return false
    }
    
    console.log(`Checking experts for domain ${votingDomain.name} (${votingDomain.id})`)
    const isExpert = votingDomain.experts?.some((ex: any) => ex.user.id === sessionUser.id)
    if (!isExpert) {
         console.log('User is not expert of voting domain:', {
             votingDomainName: votingDomain.name,
             votingDomainId,
             userId: sessionUser.id,
             expertsCount: votingDomain.experts?.length,
             experts: votingDomain.experts.map(e => e.user.email)
         })
    } else {
        console.log('User IS expert!')
    }
    return isExpert
  }

  // Test with selectedDomain set to Philosophy (as if user clicked it)
  const philosophyId = proposals[0]?.targetDomainId
  const philosophy = findDomainById(roots, philosophyId!)
  
  for (const p of proposals) {
      console.log('--- Checking Proposal', p.id, p.type, p.targetDomainId)
      const result = canVoteOnProposal(p, user, roots, philosophy) // Passing philosophy as selectedDomain
      console.log('Can Vote?', result)
  }
}

run()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
