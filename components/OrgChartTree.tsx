'use client'

import React, { useRef, useState, useLayoutEffect, useCallback } from 'react'
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

type Rect = { x: number; y: number; w: number; h: number }

const TreeNode = ({ 
  node, 
  selectedId, 
  onSelect, 
  onAddChild,
  canAddChild,
  registerRef
}: { 
  node: DomainNode; 
  selectedId: string | null; 
  onSelect: (node: DomainNode) => void; 
  onAddChild?: (node: DomainNode) => void;
  canAddChild?: (node: DomainNode) => boolean;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) => {
  const isSelected = selectedId === node.id
  const hasChildren = node.children && node.children.length > 0
  const showAdd = onAddChild && (!canAddChild || canAddChild(node))

  return (
    <li>
      <div 
        ref={(el) => registerRef(node.id, el)}
        className={cn(
          "node-card relative z-10 group min-w-[120px] p-2 rounded-lg border transition-all duration-200 flex flex-col items-center gap-1",
          isSelected 
            ? "border-warm-primary bg-warm-primary/10 shadow-md !border-warm-primary" 
            : "border-site-border bg-site-bg hover:border-warm-primary/50 hover:shadow-sm cursor-pointer"
        )}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node)
        }}
      >
        <div className="flex flex-col items-center">
          <span className={cn(
            "font-bold text-sm text-center whitespace-nowrap",
            isSelected ? "text-warm-primary" : "text-site-text"
          )}>
            {node.name}
          </span>
          <span className="text-[10px] text-site-muted">
            {node.counts.posts} نوشته
          </span>
        </div>
        
        {showAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddChild(node)
            }}
            className={cn(
              "absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-site-bg border border-site-border flex items-center justify-center shadow-sm hover:bg-warm-primary hover:text-white hover:border-warm-primary transition-colors opacity-0 group-hover:opacity-100",
              isSelected && "opacity-100"
            )}
            title="Add Child Domain"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeNode 
              key={child.id} 
              node={child} 
              selectedId={selectedId} 
              onSelect={onSelect}
              onAddChild={onAddChild}
              canAddChild={canAddChild}
              registerRef={registerRef}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OrgChartTree({ nodes, selectedId, onSelect, onAddChild, canAddChild }: OrgChartTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement>>({})
  const [lines, setLines] = useState<Array<{ fromId: string; toId: string }>>([])
  const [coords, setCoords] = useState<Record<string, Rect>>({})

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current[id] = el
    else delete nodeRefs.current[id]
  }, [])

  // Discover all nodes to find secondary parents
  useLayoutEffect(() => {
    const allLines: Array<{ fromId: string; toId: string }> = []
    const process = (n: DomainNode) => {
      if (n.parentLinks && n.parentLinks.length > 1) {
        // First parent is the primary one (handled by CSS). 
        // Others are secondary (need SVG lines).
        for (let i = 1; i < n.parentLinks.length; i++) {
          allLines.push({ fromId: n.parentLinks[i].parentDomainId, toId: n.id })
        }
      }
      n.children.forEach(process)
    }
    nodes.forEach(process)
    setLines(allLines)
  }, [nodes])

  // Measure positions
  const updateCoords = useCallback(() => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const newCoords: Record<string, Rect> = {}
    
    Object.entries(nodeRefs.current).forEach(([id, el]) => {
      const rect = el.getBoundingClientRect()
      newCoords[id] = {
        x: rect.left - containerRect.left + containerRef.current!.scrollLeft,
        y: rect.top - containerRect.top + containerRef.current!.scrollTop,
        w: rect.width,
        h: rect.height
      }
    })
    setCoords(newCoords)
  }, [])

  useLayoutEffect(() => {
    updateCoords()
    window.addEventListener('resize', updateCoords)
    return () => window.removeEventListener('resize', updateCoords)
  }, [updateCoords, nodes])

  if (!nodes || nodes.length === 0) return null

  return (
    <div className="w-full overflow-auto custom-scrollbar py-8 bg-site-bg/50 rounded-xl border border-site-border/50 relative">
      <div ref={containerRef} className="min-w-max flex justify-center org-tree px-4 relative">
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
          {lines.map((line, idx) => {
            const from = coords[line.fromId]
            const to = coords[line.toId]
            if (!from || !to) return null

            // Calculate start and end points
            // Start from bottom center of parent, end at top center of child
            const x1 = from.x + from.w / 2
            const y1 = from.y + from.h
            const x2 = to.x + to.w / 2
            const y2 = to.y

            // Draw a curved path (cubic bezier)
            const midY = (y1 + y2) / 2
            const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

            return (
              <path 
                key={idx}
                d={path}
                fill="none"
                stroke="rgb(var(--site-border))"
                strokeWidth="1"
                strokeDasharray="4,2"
                className="transition-all duration-500 opacity-60"
              />
            )
          })}
        </svg>
        <ul>
          {nodes.map((node) => (
            <TreeNode 
              key={node.id} 
              node={node} 
              selectedId={selectedId} 
              onSelect={onSelect}
              onAddChild={onAddChild}
              canAddChild={canAddChild}
              registerRef={registerRef}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

