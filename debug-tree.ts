
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type DomainTreeNode = {
  id: string
  name: string
  parentId: string | null
  experts: any[]
  children: DomainTreeNode[]
}

function buildTree(rows: any[]): DomainTreeNode[] {
  const byId: Record<string, DomainTreeNode> = {}
  const all: DomainTreeNode[] = new Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const node: DomainTreeNode = { ...r, children: [] }
    byId[node.id] = node
    all[i] = node
  }

  const roots: DomainTreeNode[] = []
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

function findDomainById(roots: DomainTreeNode[], id: string): DomainTreeNode | null {
  const stack: DomainTreeNode[] = [...roots]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur.id === id) return cur
    for (const c of cur.children) stack.push(c)
  }
  return null
}

async function main() {
  const email = 'c@gmail.com'
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    console.log(`User with email ${email} not found`)
    return
  }
  
  console.log(`User ID: ${user.id}`)

  // Simulate GET /api/admin/domains
  const domains = await prisma.domain.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
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
    },
  })

  const rows = domains.map((d) => ({
    id: d.id,
    name: d.name,
    parentId: d.parentId,
    experts: d.experts,
  }))

  const roots = buildTree(rows)
  
  // Find Philosophy domain
  const philosophy = domains.find(d => d.name === 'Philosophy' || d.slug === 'philosophy') // Assuming name is Philosophy
  // Or check the previous output which had ID: cmlztlgsw000053zqhhfvsi5s
  const philosophyId = 'cmlztlgsw000053zqhhfvsi5s'
  
  console.log(`Looking for domain ID: ${philosophyId}`)
  
  const domainNode = findDomainById(roots, philosophyId)
  
  if (!domainNode) {
    console.log('Domain node not found in tree!')
  } else {
    console.log(`Domain found: ${domainNode.name}`)
    console.log(`Experts count: ${domainNode.experts.length}`)
    
    const isExpert = domainNode.experts.some((ex: any) => ex.user.id === user.id)
    console.log(`Is user expert? ${isExpert}`)
    
    if (!isExpert) {
      console.log('User not found in experts list:')
      domainNode.experts.forEach(ex => {
        console.log(`- ${ex.user.email} (${ex.user.id})`)
      })
    }
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
