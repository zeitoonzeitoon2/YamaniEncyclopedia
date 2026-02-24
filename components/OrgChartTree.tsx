'use client'

import React from 'react'
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
  experts: any[]
  counts: { posts: number; children: number }
  children: DomainNode[]
}

interface OrgChartTreeProps {
  nodes: DomainNode[]
  selectedId: string | null
  onSelect: (node: DomainNode) => void
  onAddChild?: (node: DomainNode) => void
}

const TreeNode = ({ node, selectedId, onSelect, onAddChild }: { node: DomainNode; selectedId: string | null; onSelect: (node: DomainNode) => void; onAddChild?: (node: DomainNode) => void }) => {
  const isSelected = selectedId === node.id
  const hasChildren = node.children && node.children.length > 0

  return (
    <li>
      <div 
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
        
        {/* Add Child Button - visible on hover or selected */}
        {onAddChild && (
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OrgChartTree({ nodes, selectedId, onSelect, onAddChild }: OrgChartTreeProps) {
  if (!nodes || nodes.length === 0) return null

  return (
    <div className="w-full overflow-auto custom-scrollbar py-8 bg-site-bg/50 rounded-xl border border-site-border/50">
      <div className="min-w-max flex justify-center org-tree px-4">
        <ul>
          {nodes.map((node) => (
            <TreeNode 
              key={node.id} 
              node={node} 
              selectedId={selectedId} 
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
