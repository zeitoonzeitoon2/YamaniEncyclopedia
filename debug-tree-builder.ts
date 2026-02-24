
type DomainTreeExpert = {
  id: string
  role: string
  wing: string
  user: {
    id: string
    name: string | null
    email: string | null
    role: string
  }
}

type DomainTreeNode = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  experts: DomainTreeExpert[]
  counts: { posts: number; children: number }
  children: DomainTreeNode[]
}

function buildTree(rows: Array<Omit<DomainTreeNode, 'children'>>): DomainTreeNode[] {
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
  // Sort (omitted for brevity)
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

const mockRows = [
  {
    id: "cmlztlgsw000053zqhhfvsi5s",
    name: "Philosophy",
    slug: "philosophy",
    description: null,
    parentId: null,
    experts: [
      {
        id: "cmlzu74o70004ut41a1vj9vbb",
        role: "EXPERT",
        wing: "RIGHT",
        user: {
          id: "cmlz7zm4v0001ggjf47mgqeql",
          name: "c@gmail.com",
          email: "c@gmail.com",
          role: "USER"
        }
      }
    ],
    counts: { posts: 0, children: 0 }
  }
];

const roots = buildTree(mockRows);
console.log('Roots:', JSON.stringify(roots, null, 2));

const votingDomainId = "cmlztlgsw000053zqhhfvsi5s";
const votingDomain = findDomainById(roots, votingDomainId);
console.log('Found Domain:', votingDomain ? votingDomain.name : 'null');

if (votingDomain) {
    const userId = "cmlz7zm4v0001ggjf47mgqeql";
    const isExpert = votingDomain.experts.some((ex: any) => ex.user.id === userId);
    console.log('Is Expert:', isExpert);
}
