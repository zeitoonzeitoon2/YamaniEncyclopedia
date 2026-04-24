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
    <li className="relative px-4 py-6 flex flex-col items-center">
      <div 
        ref={(el) => registerRef(node.id, el)}
        className={cn(
          "node-card relative z-10 group min-w-[140px] p-3 rounded-xl border transition-all duration-300 flex flex-col items-center gap-1.5 shadow-sm",
          isSelected 
            ? "border-warm-primary bg-warm-primary/15 shadow-warm-primary/20 shadow-lg scale-105" 
            : "border-site-border bg-site-bg/80 backdrop-blur-sm hover:border-warm-primary/60 hover:shadow-md cursor-pointer hover:-translate-y-1"
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
          <span className="text-[10px] text-site-muted font-medium">
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
              "absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-site-bg border border-site-border flex items-center justify-center shadow-md hover:bg-warm-primary hover:text-white hover:border-warm-primary transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100",
              isSelected && "opacity-100 scale-100"
            )}
            title="Add Child Domain"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {hasChildren && (
        <ul className="flex flex-row justify-center mt-8 gap-4">
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
  const [lines, setLines] = useState<Array<{ fromId: string; toId: string; isPrimary: boolean }>>([])
  const [coords, setCoords] = useState<Record<string, Rect>>({})

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current[id] = el
    else delete nodeRefs.current[id]
  }, [])

  // Discover all nodes and their parent links
  useLayoutEffect(() => {
    const allLines: Array<{ fromId: string; toId: string; isPrimary: boolean }> = []
    const process = (n: DomainNode) => {
      // Primary parent
      if (n.parentId) {
        allLines.push({ fromId: n.parentId, toId: n.id, isPrimary: true })
      }
      
      // Secondary parents (excluding the primary one to avoid duplication)
      if (n.parentLinks) {
        n.parentLinks.forEach(link => {
          if (link.parentDomainId !== n.parentId) {
            allLines.push({ fromId: link.parentDomainId, toId: n.id, isPrimary: false })
          }
        })
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
    const observer = new ResizeObserver(updateCoords)
    if (containerRef.current) observer.observe(containerRef.current)
    window.addEventListener('resize', updateCoords)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateCoords)
    }
  }, [updateCoords, nodes])

  if (!nodes || nodes.length === 0) return null

  return (
    <div className="w-full overflow-auto custom-scrollbar py-12 bg-site-bg/30 rounded-2xl border border-site-border/40 relative shadow-inner">
      <div ref={containerRef} className="min-w-max flex justify-center px-8 relative">
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
          {lines.map((line, idx) => {
            const from = coords[line.fromId]
            const to = coords[line.toId]
            if (!from || !to) return null

            const x1 = from.x + from.w / 2
            const y1 = from.y + from.h
            const x2 = to.x + to.w / 2
            const y2 = to.y

            const midY = (y1 + y2) / 2
            const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

            return (
              <path 
                key={`${line.fromId}-${line.toId}-${idx}`}
                d={path}
                fill="none"
                stroke="rgb(var(--site-border))"
                strokeWidth={line.isPrimary ? "2" : "2"}
                strokeDasharray="0"
                className={cn(
                  "transition-all duration-700",
                  line.isPrimary ? "opacity-80" : "opacity-80"
                )}
              />
            )
          })}
        </svg>
        <ul className="flex flex-row justify-center gap-8">
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


