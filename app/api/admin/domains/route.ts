import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { slugify } from '@/lib/utils'

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
  const sortRec = (n: DomainTreeNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name))
    for (let i = 0; i < n.children.length; i++) sortRec(n.children[i])
  }
  roots.sort((a, b) => a.name.localeCompare(b.name))
  for (let i = 0; i < roots.length; i++) sortRec(roots[i])
  return roots
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(_request.url)
    const mode = (url.searchParams.get('mode') || '').trim()

    if (mode === 'select') {
      const items = await prisma.domain.findMany({
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      })
      return NextResponse.json({ items })
    }

    if (session.user?.role !== 'ADMIN') {
      const userId = (session.user?.id || '').trim()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const membership = await prisma.domainExpert.findFirst({
        where: { userId },
        select: { id: true },
      })
      if (!membership) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const rows: Array<Omit<DomainTreeNode, 'children'>> = domains.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      parentId: d.parentId,
      experts: d.experts,
      counts: { posts: d._count.posts, children: d._count.children },
    }))

    return NextResponse.json({ roots: buildTree(rows) })
  } catch (error) {
    console.error('Error fetching domains tree:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const parentIdRaw = typeof body.parentId === 'string' ? body.parentId.trim() : ''
    const parentId = parentIdRaw ? parentIdRaw : null
    const slugRaw = typeof body.slug === 'string' ? body.slug.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (parentId) {
      const parent = await prisma.domain.findUnique({ where: { id: parentId }, select: { id: true } })
      if (!parent) return NextResponse.json({ error: 'Invalid parentId' }, { status: 400 })
    }

    const slug = slugRaw ? slugify(slugRaw) : slugify(name)

    const created = await prisma.$transaction(async (tx) => {
      const domain = await tx.domain.create({
        data: { name, slug, parentId, description },
        select: { id: true, name: true, slug: true, parentId: true },
      })

      // Initialize voting shares: 
      // If has parent, parent's RIGHT wing owns 100% of child's RIGHT wing. 
      // Otherwise (root), the domain's RIGHT wing owns 100% of itself.
      await tx.domainVotingShare.create({
        data: {
          domainId: domain.id,
          domainWing: 'RIGHT',
          ownerDomainId: domain.id,
          ownerWing: 'RIGHT',
          percentage: 100,
        },
      })

      return domain
    })

    return NextResponse.json({ success: true, domain: created })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('Error creating domain:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
