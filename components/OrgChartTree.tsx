'use client'

import React, { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'

// Simple utility for class names
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

export type DomainNode = {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  parentLinks?: Array<{ parentDomainId: string }>
  experts: any[]
  counts: { posts: number; children: number }
  children: DomainNode[]
}

interface OrgChartTreeProps {
  nodes: DomainNode[]
  selectedId: string | null
  onSelect: (node: DomainNode) => void
  onAddChild?: (node: DomainNode) => void
  canAddChild?: (node: DomainNode) => boolean
}

type NodePos = {
  id: string
  node: DomainNode
  x: number
  y: number
  width: number
  height: number
  depth: number
}

export default function OrgChartTree({ nodes, selectedId, onSelect, onAddChild, canAddChild }: OrgChartTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ nodes: NodePos[]; lines: Array<{ from: string; to: string }> }>({ nodes: [], lines: [] })

  // Constants for layout
  const NODE_WIDTH = 160
  const NODE_HEIGHT = 70
  const HORIZONTAL_GAP = 40
  const VERTICAL_GAP = 120

  const calculateLayout = useCallback(() => {
    if (!nodes || nodes.length === 0) return

    const allNodesMap = new Map<string, DomainNode>()
    const relations: Array<{ from: string; to: string }> = []
    const depths = new Map<string, number>()

    // 1. Flatten and discover structure
    const traverse = (n: DomainNode, depth: number) => {
      allNodesMap.set(n.id, n)
      depths.set(n.id, Math.max(depths.get(n.id) || 0, depth))
      
      // Collect all parent links for DAG support
      if (n.parentLinks && n.parentLinks.length > 0) {
        n.parentLinks.forEach(link => {
          relations.push({ from: link.parentDomainId, to: n.id })
        })
      } else if (n.parentId) {
        relations.push({ from: n.parentId, to: n.id })
      }
      
      n.children.forEach(c => traverse(c, depth + 1))
    }
    nodes.forEach(n => traverse(n, 0))

    const uniqueRelations = Array.from(new Set(relations.map(r => `${r.from}->${r.to}`)))
      .map(s => {
        const [from, to] = s.split('->')
        return { from, to }
      })

    const nodeIds = Array.from(allNodesMap.keys())
    const maxDepth = Math.max(...Array.from(depths.values()))

    // 2. Initial horizontal positioning (Bottom-Up)
    const positions = new Map<string, number>()
    
    // Process layers from bottom to top
    for (let d = maxDepth; d >= 0; d--) {
      const layerNodes = nodeIds.filter(id => depths.get(id) === d)
      layerNodes.sort((a, b) => (allNodesMap.get(a)?.name || '').localeCompare(allNodesMap.get(b)?.name || ''))

      if (d === maxDepth) {
        // Leaf layer: spread evenly
        layerNodes.forEach((id, idx) => {
          positions.set(id, idx * (NODE_WIDTH + HORIZONTAL_GAP))
        })
      } else {
        // Parent layer: center over children
        layerNodes.forEach((id) => {
          const childrenIds = uniqueRelations.filter(r => r.from === id).map(r => r.to)
          if (childrenIds.length > 0) {
            const childrenX = childrenIds.map(cid => positions.get(cid) || 0)
            const avgX = childrenX.reduce((a, b) => a + b, 0) / childrenX.length
            positions.set(id, avgX)
          } else {
            // No children (it's a leaf at a non-max depth)
            const prevInLayer = layerNodes.slice(0, layerNodes.indexOf(id))
            const lastX = prevInLayer.length > 0 ? positions.get(prevInLayer[prevInLayer.length - 1])! : -HORIZONTAL_GAP - NODE_WIDTH
            positions.set(id, lastX + NODE_WIDTH + HORIZONTAL_GAP)
          }
        })
      }
    }

    // 3. Collision Resolution (Simple push)
    for (let d = 0; d <= maxDepth; d++) {
      const layerNodes = nodeIds.filter(id => depths.get(id) === d)
      layerNodes.sort((a, b) => (positions.get(a) || 0) - (positions.get(b) || 0))
      
      for (let i = 1; i < layerNodes.length; i++) {
        const prev = layerNodes[i-1]
        const curr = layerNodes[i]
        const prevX = positions.get(prev)!
        const currX = positions.get(curr)!
        if (currX < prevX + NODE_WIDTH + HORIZONTAL_GAP) {
          positions.set(curr, prevX + NODE_WIDTH + HORIZONTAL_GAP)
        }
      }
    }

    // 4. Center the whole thing
    const minX = Math.min(...Array.from(positions.values()))
    nodeIds.forEach(id => positions.set(id, (positions.get(id) || 0) - minX))

    const finalNodes: NodePos[] = nodeIds.map(id => ({
      id,
      node: allNodesMap.get(id)!,
      x: positions.get(id)!,
      y: depths.get(id)! * VERTICAL_GAP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      depth: depths.get(id)!
    }))

    setLayout({ nodes: finalNodes, lines: uniqueRelations })
  }, [nodes])

  useLayoutEffect(() => {
    calculateLayout()
  }, [calculateLayout])

  const totalWidth = useMemo(() => {
    if (layout.nodes.length === 0) return 0
    return Math.max(...layout.nodes.map(n => n.x + n.width)) + 100
  }, [layout.nodes])

  const totalHeight = useMemo(() => {
    if (layout.nodes.length === 0) return 0
    return Math.max(...layout.nodes.map(n => n.y + n.height)) + 100
  }, [layout.nodes])

  if (!nodes || nodes.length === 0) return null

  return (
    <div className="w-full overflow-auto custom-scrollbar py-12 bg-site-bg/30 rounded-2xl border border-site-border/40 relative shadow-inner h-[600px]">
      <div 
        ref={containerRef} 
        className="relative mx-auto" 
        style={{ width: totalWidth, height: totalHeight }}
      >
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
          {layout.lines.map((line, idx) => {
            const from = layout.nodes.find(n => n.id === line.from)
            const to = layout.nodes.find(n => n.id === line.to)
            if (!from || !to) return null

            const x1 = from.x + from.width / 2
            const y1 = from.y + from.height
            const x2 = to.x + to.width / 2
            const y2 = to.y

            const midY = (y1 + y2) / 2
            const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

            return (
              <path 
                key={`${line.from}-${line.to}-${idx}`}
                d={path}
                fill="none"
                stroke="rgb(var(--site-border))"
                strokeWidth="2"
                className="opacity-80 transition-all duration-700"
              />
            )
          })}
        </svg>

        {layout.nodes.map((n) => {
          const isSelected = selectedId === n.id
          const showAdd = onAddChild && (!canAddChild || canAddChild(n.node))
          
          return (
            <div
              key={n.id}
              style={{ 
                position: 'absolute', 
                left: n.x, 
                top: n.y, 
                width: n.width, 
                height: n.height 
              }}
              className={cn(
                "group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-1 shadow-sm z-10",
                isSelected 
                  ? "border-warm-primary bg-warm-primary/15 shadow-warm-primary/20 shadow-lg scale-105" 
                  : "border-site-border bg-site-bg/80 backdrop-blur-sm hover:border-warm-primary/60 hover:shadow-md cursor-pointer hover:-translate-y-1"
              )}
              onClick={() => onSelect(n.node)}
            >
              <span className={cn(
                "font-bold text-xs text-center leading-tight",
                isSelected ? "text-warm-primary" : "text-site-text"
              )}>
                {n.node.name}
              </span>
              <span className="text-[9px] text-site-muted font-medium">
                {n.node.counts.posts} نوشته
              </span>

              {showAdd && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddChild!(n.node)
                  }}
                  className={cn(
                    "absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-site-bg border border-site-border flex items-center justify-center shadow-md hover:bg-warm-primary hover:text-white hover:border-warm-primary transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100",
                    isSelected && "opacity-100 scale-100"
                  )}
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}



