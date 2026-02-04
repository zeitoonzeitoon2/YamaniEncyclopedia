'use client'

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'


// Custom node component with diff display capability
const DiffNode = ({ data, isConnectable }: any) => {
  const t = useTranslations('diagramComparison')
  const getNodeStyle = () => {
    const baseStyle = "px-4 py-2 shadow-md rounded-md min-w-[120px] transition-colors duration-300"

    // If in temporary highlight mode, amber color takes priority
    const bgClass = data?._highlight
      ? 'bg-amber-300 text-gray-900'
      : (data?.renameFill === 'blue')
      ? 'bg-blue-100 text-blue-800'
      : data.status === 'added'
      ? 'bg-green-100 text-green-800'
      : data.status === 'removed'
      ? 'bg-red-100 text-red-800'
      : 'bg-warm-cream text-gray-800'

    // By default, no stroke (border)
    let borderClass = ''

    // Stroke color based on flashcard status; only applied when it has a flashcard
    switch (data.flashBorder) {
      case 'orange':
        borderClass = 'border-4 border-amber-500'
        break
      case 'red':
        borderClass = 'border-4 border-red-500'
        break
      case 'green':
        borderClass = 'border-4 border-green-500'
        break
      case 'blue':
        borderClass = 'border-4 border-blue-500'
        break
      default:
        // none => no stroke
        break
    }

    return `${baseStyle} ${bgClass} ${borderClass}`
  }

  return (
    <div className={getNodeStyle()}>
      <Handle
        type="target"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-gray-600"
      />
      <div className="text-center">
        <div className="text-sm font-bold">{data.label}</div>
        {/* Flashcard indicator - removed and replaced with colored stroke based on flashcard status */}
        {data.status === 'added' && (
          <div className="text-xs text-green-600 mt-1">{t('newNode')}</div>
        )}
        {data.status === 'removed' && (
          <div className="text-xs text-red-600 mt-1">{t('deletedNode')}</div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-gray-600"
      />
    </div>
  )
}

// Define nodeTypes outside the component to avoid re-rendering
const nodeTypes: NodeTypes = {
  diff: DiffNode,
}

interface DiagramData {
  nodes: Node[]
  edges: Edge[]
}

interface DiagramComparisonProps {
  originalData?: DiagramData
  proposedData?: DiagramData
  onShowArticleComparison?: (originalLink?: string, proposedLink?: string) => void
  onStatsChange?: (stats: {
    nodes: { added: number; removed: number; unchanged: number; total: number }
    flashcards: { added: number; removed: number; edited: number }
    articles: { added: number; removed: number; edited: number }
  }) => void
}

export default function DiagramComparison({
  originalData = { nodes: [], edges: [] },
  proposedData = { nodes: [], edges: [] },
  onShowArticleComparison,
  onStatsChange,
}: DiagramComparisonProps) {
  const t = useTranslations('diagramComparison')
  // Memoize nodeTypes to avoid React Flow warning
  const memoizedNodeTypes = useMemo(() => nodeTypes, [])
  
  // Flashcard states
  const [selectedOriginalNodeId, setSelectedOriginalNodeId] = useState<string | null>(null)
  const [selectedProposedNodeId, setSelectedProposedNodeId] = useState<string | null>(null)

  // References to each flow instance for zoom/fitView
  const originalFlowRef = useRef<any>(null)
  const proposedFlowRef = useRef<any>(null)

  // Temporary highlight state for related nodes
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([])

  // Helper: Normalize extra links for clickability
  const normalizeExtraLink = useCallback((raw: string) => {
    try {
      let link = (raw || '').trim()
      if (!link) return ''
      // If it looks like a draft ID (long alphanumeric), return as is
      if (/^[a-z0-9]{20,}$/i.test(link)) return link
      // If it's a full external link
      if (/^https?:\/\//i.test(link)) return link
      // If it contains a domain, remove it
      link = link.replace(/^https?:\/\/[^/]+/i, '')
      // If it's in /articles/... format, return as is
      if (link.startsWith('/articles/')) return link
      // If it starts without a slash, treat it as an article slug
      link = link.replace(/^\/+/, '')
      // If after cleaning it looks like a draft ID, return as is
      if (/^[a-z0-9]{20,}$/i.test(link)) return link
      if (link.startsWith('articles/')) return `/${link}`
      return `/articles/${link}`
    } catch {
      return raw
    }
  }, [])

  // Helper: Build a unified array of extra fields
  const buildExtraItems = useCallback((data: any) => {
    const d = data || {}
    if (Array.isArray(d.extraItems)) return d.extraItems
    const texts: string[] = (d.extraTexts as string[]) || []
    const links: string[] = (d.extraLinks as string[]) || []
    return [
      ...texts.map((t) => ({ type: 'text', content: t })),
      ...links.map((l) => ({ type: 'link', content: l })),
    ] as Array<{ type: 'text' | 'link'; content: string }>
  }, [])

  // Helper: Extract primary article link from node data (supports articleDraft/previousArticleLink)
  const getNormalizedLink = useCallback((data: any) => {
    try {
      const d = data || {}
      const draft = d.articleDraft || {}
      let link: string = ''
      if (typeof draft?.slug === 'string' && draft.slug.trim()) {
        link = `/articles/${draft.slug.trim()}`
      } else if (typeof draft?.id === 'string' && draft.id.trim()) {
        const id = draft.id.trim()
        // If the ID looks like a draft ID, pass it as is to be fetched from /api/drafts
        link = /^[a-z0-9]{20,}$/i.test(id) ? id : `/articles/${id}`
      } else if (typeof d.articleLink === 'string' && d.articleLink.trim()) {
        link = d.articleLink.trim()
      }
      // Note: We no longer rely on previousArticleLink as fallback to show current status
      return link
    } catch {
      return ''
    }
  }, [])

  // Helper: Does it have a flashcard? (text, any link, or extra fields)
  const hasFlash = useCallback((data: any) => {
    const txt = typeof data?.flashText === 'string' ? data.flashText.trim() : ''
    const link = getNormalizedLink(data)
    const items = buildExtraItems(data)
    const hasExtra = !!(items && items.length > 0 && items.some((it: any) => (typeof it.content === 'string' ? it.content.trim() : '')))
    return !!txt || !!link || hasExtra
  }, [buildExtraItems, getNormalizedLink])

  // Helper: Unique signature of flashcard content to detect changes (text + link + extra fields)
  const buildFlashSignature = useCallback((data: any) => {
    const txt = typeof data?.flashText === 'string' ? data.flashText.trim() : ''
    const link = getNormalizedLink(data)
    const items = buildExtraItems(data)
    const extraNorm = items && items.length
      ? items.map((it: any) => (typeof it.content === 'string' ? it.content.trim() : '')).filter(Boolean).join('|')
      : ''
    return `${txt}|${link}|${extraNorm}`
  }, [buildExtraItems, getNormalizedLink])

  // Calculate differences
  const { originalWithDiff, proposedWithDiff, stats } = useMemo(() => {
    const originalNodeIds = new Set(originalData.nodes.map(n => n.id))
    const proposedNodeIds = new Set(proposedData.nodes.map(n => n.id))

    // Create map for fast access
    const originalMap = new Map(originalData.nodes.map(n => [n.id, n]))
    const proposedMap = new Map(proposedData.nodes.map(n => [n.id, n]))

    // Added nodes
    const addedNodeIds = new Set(Array.from(proposedNodeIds).filter(id => !originalNodeIds.has(id)))
    // Removed nodes
    const removedNodeIds = new Set(Array.from(originalNodeIds).filter(id => !proposedNodeIds.has(id)))
    // Unchanged nodes
    const unchangedNodeIds = new Set(Array.from(originalNodeIds).filter(id => proposedNodeIds.has(id)))

    // Create original diagram with removed markers + flashcard status
    const originalWithDiff: DiagramData = {
      nodes: originalData.nodes.map(node => {
        const proposedNode = proposedMap.get(node.id)

        const oHas = hasFlash(node.data)
        const pHas = hasFlash(proposedNode?.data)
        const oSig = buildFlashSignature(node.data)
        const pSig = buildFlashSignature(proposedNode?.data)

        let flashBorder: 'none' | 'orange' | 'red' | 'green' | 'blue' = 'none'
        if (oHas && pHas) {
          flashBorder = oSig !== pSig ? 'blue' : 'orange' // Flashcard content changed => blue, otherwise orange
        } else if (oHas && !pHas) {
          flashBorder = 'red' // Flashcard removed => red in current diagram only
        } else {
          flashBorder = 'none' // No flashcard or newly added (in proposed)
        }

        // Detect rename (label) for nodes that exist in both diagrams
        let renameFill: 'blue' | undefined = undefined
        if (unchangedNodeIds.has(node.id)) {
          const oLabel = typeof (node as any)?.data?.label === 'string' ? (node as any).data.label.trim() : ''
          const pLabel = typeof (proposedNode as any)?.data?.label === 'string' ? (proposedNode as any).data.label.trim() : ''
          if (oLabel !== pLabel) {
            renameFill = 'blue'
          }
        }

        return {
          ...node,
          type: 'diff',
          data: {
            ...node.data,
            status: removedNodeIds.has(node.id) ? 'removed' : 'unchanged',
            flashBorder,
            renameFill,
          }
        }
      }),
      edges: originalData.edges.filter(edge => 
        !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      )
    }

    // Create proposed diagram with added markers + flashcard status
    const proposedWithDiff: DiagramData = {
      nodes: proposedData.nodes.map(node => {
        const originalNode = originalMap.get(node.id)

        const oHas = hasFlash(originalNode?.data)
        const pHas = hasFlash(node.data)
        const oSig = buildFlashSignature(originalNode?.data)
        const pSig = buildFlashSignature(node.data)

        let flashBorder: 'none' | 'orange' | 'red' | 'green' | 'blue' = 'none'
        if (oHas && pHas) {
          flashBorder = oSig !== pSig ? 'blue' : 'orange' // Flashcard content changed => blue, otherwise orange
        } else if (!oHas && pHas) {
          flashBorder = 'green' // New flashcard => green in proposed diagram only
        } else {
          flashBorder = 'none' // Flashcard removed or doesn't exist => no stroke in proposed diagram
        }

        // Detect rename (label) for nodes that exist in both diagrams
        let renameFill: 'blue' | undefined = undefined
        if (originalNode) {
          const oLabel = typeof (originalNode as any)?.data?.label === 'string' ? (originalNode as any).data.label.trim() : ''
          const pLabel = typeof (node as any)?.data?.label === 'string' ? (node as any).data.label.trim() : ''
          if (oLabel !== pLabel) {
            renameFill = 'blue'
          }
        }

        return {
          ...node,
          type: 'diff',
          data: {
            ...node.data,
            status: addedNodeIds.has(node.id) ? 'added' : 'unchanged',
            flashBorder,
            renameFill,
          }
        }
      }),
      edges: proposedData.edges
    }

    const stats = {
      added: addedNodeIds.size,
      removed: removedNodeIds.size,
      unchanged: unchangedNodeIds.size,
      total: originalNodeIds.size + addedNodeIds.size
    }

    return { originalWithDiff, proposedWithDiff, stats }
  }, [originalData, proposedData, hasFlash, buildFlashSignature])

  // Calculate aggregated stats for flashcards/articles and notify parent component
  useEffect(() => {
    if (!onStatsChange) return

    // Flashcard stats from node borders
    const flashAdded = proposedWithDiff.nodes.filter(n => (n as any)?.data?.flashBorder === 'green').length
    const flashRemoved = originalWithDiff.nodes.filter(n => (n as any)?.data?.flashBorder === 'red').length
    const flashEdited = proposedWithDiff.nodes.filter(n => (n as any)?.data?.flashBorder === 'blue').length

    // Article stats by comparing normalized links
    const getLink = (d: any) => {
      try {
        const link = getNormalizedLink(d)
        return (link || '').trim()
      } catch {
        return ''
      }
    }
    const originalLinks = new Map(originalData.nodes.map(n => [n.id, getLink((n as any).data)]))
    const proposedLinks = new Map(proposedData.nodes.map(n => [n.id, getLink((n as any).data)]))

    const allIds = new Set<string>([...Array.from(originalLinks.keys()), ...Array.from(proposedLinks.keys())])
    let artAdded = 0, artRemoved = 0, artEdited = 0
    allIds.forEach((id) => {
      const o = (originalLinks.get(id) || '')
      const p = (proposedLinks.get(id) || '')
      const oHas = !!o
      const pHas = !!p
      if (!oHas && pHas) artAdded++
      else if (oHas && !pHas) artRemoved++
      else if (oHas && pHas && o !== p) artEdited++
    })

    onStatsChange({
      nodes: { ...stats },
      flashcards: { added: flashAdded, removed: flashRemoved, edited: flashEdited },
      articles: { added: artAdded, removed: artRemoved, edited: artEdited },
    })
  }, [onStatsChange, originalWithDiff, proposedWithDiff, stats, originalData.nodes, proposedData.nodes, getNormalizedLink])

  // Helper for displaying flashcard contents
  const FlashcardView = ({ data, title, allNodes, onSelectNode, side, onCompareArticle }: { data: any; title: string; allNodes: any[]; onSelectNode: (id: string) => void; side: 'original' | 'proposed'; onCompareArticle?: (side: 'original' | 'proposed', link: string, extraIndex?: number) => void }) => {
    const t = useTranslations('diagramComparison')
    if (!data) return null
    const items = buildExtraItems(data)
    const primaryLink = getNormalizedLink(data)
    const related: string[] = Array.isArray((data as any)?.relatedNodeIds) ? (data as any).relatedNodeIds : []
    const findLabel = (id: string) => {
      const n = allNodes.find((nn: any) => nn.id === id)
      return (n && (n as any).data && (n as any).data.label) ? (n as any).data.label : id
    }
    const hasAnything = (typeof data.flashText === 'string' && data.flashText.trim()) || primaryLink || (items && items.some((it: any) => (it?.content || '').trim())) || (related && related.length > 0)
    if (!hasAnything) return (
      <div className="text-sm text-site-muted">{t('noFlashcard')}</div>
    )
    return (
      <div className="bg-stone-900/40 border border-amber-700/40 rounded-lg p-3">
        <div className="font-semibold mb-3 text-amber-100">{title}</div>

        {data.flashText && (
          <div className="mb-3">
            <div className="text-xs text-amber-300 mb-1">{t('flashcardText')}</div>
            <div className="rounded-md border border-amber-700/40 bg-stone-800/60 p-2 whitespace-pre-wrap text-sm text-amber-50 break-words break-all max-h-40 overflow-y-auto overflow-x-hidden">
              {String(data.flashText)}
            </div>
          </div>
        )}

        {primaryLink && (
          <div className="mb-3">
            <div className="text-xs text-amber-300 mb-1">{t('firstLink')}</div>
            <div className="rounded-md border border-amber-700/40 bg-stone-800/60 p-2 text-sm flex items-center justify-between gap-2">
              <a href={primaryLink} target="_blank" className="text-blue-300 underline break-all">{primaryLink}</a>
              {onCompareArticle ? (
                <button
                  type="button"
                  onClick={() => onCompareArticle(side, primaryLink)}
                  className="text-amber-300 hover:text-amber-200 text-xs underline whitespace-nowrap"
                >
                  {t('view')}
                </button>
              ) : (
                <a href={primaryLink} target="_blank" className="text-amber-300 hover:text-amber-200 text-xs underline whitespace-nowrap">{t('view')}</a>
              )}
            </div>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="mb-1 space-y-2">
            {items.map((it: any, idx: number) => (
              <div key={idx} className="">
                <div className="text-xs text-amber-300 mb-1">{
                  it.type === 'link'
                    ? (() => {
                        const base = primaryLink ? 1 : 0
                        const linkOrder = items.slice(0, idx + 1).filter((x: any) => x?.type === 'link').length
                        const linkNumber = base + linkOrder
                        const ordLabel = t(`ordinals.${linkNumber}` as any) || t('linkNumber', { number: linkNumber })
                        return t('linkWithOrdinal', { ordinal: ordLabel })
                      })()
                    : t('extraText', { index: idx + 1 })
                }</div>
                {it.type === 'link' ? (
                  <div className="rounded-md border border-amber-700/40 bg-stone-800/60 p-2 text-sm flex items-center justify-between gap-2">
                    <a href={normalizeExtraLink(String(it.content || ''))} target="_blank" className="text-blue-300 underline break-all">
                      {String(it.content || '')}
                    </a>
                    {onCompareArticle ? (
                      <button
                        type="button"
                        onClick={() => onCompareArticle(side, normalizeExtraLink(String(it.content || '')), idx)}
                        className="text-amber-300 hover:text-amber-200 text-xs underline whitespace-nowrap"
                      >
                        {t('view')}
                       </button>
                    ) : (
                      <a href={normalizeExtraLink(String(it.content || ''))} target="_blank" className="text-amber-300 hover:text-amber-200 text-xs underline whitespace-nowrap">{t('view')}</a>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-700/40 bg-stone-800/60 p-2 whitespace-pre-wrap text-sm text-amber-50 break-words break-all max-h-40 overflow-y-auto overflow-x-hidden">
                    {String(it.content || '')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {related && related.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-700/40">
            <div className="text-xs text-amber-300 mb-1">{t('relatedTo')}</div>
            <div className="flex flex-wrap gap-2">
              {related.map((rid) => (
                <button
                  key={rid}
                  type="button"
                  onClick={() => onSelectNode(rid)}
                  className="px-2 py-1 rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/40 text-xs"
                  title={findLabel(rid)}
                >
                  {findLabel(rid)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Active selection
  const activeNodeId = selectedOriginalNodeId || selectedProposedNodeId
  const activeOriginalNode = activeNodeId ? originalWithDiff.nodes.find(n => n.id === activeNodeId) : null
  const activeProposedNode = activeNodeId ? proposedWithDiff.nodes.find(n => n.id === activeNodeId) : null

  // Temporary highlight of two nodes (source/target)
  const highlightRelatedNodes = useCallback((sourceId: string, targetId: string) => {
    setHighlightedNodeIds([sourceId, targetId])
    setTimeout(() => setHighlightedNodeIds([]), 2000)
  }, [])

  // Fit view to show both nodes, then highlight
  const focusNodesAndHighlight = useCallback((sourceId: string, targetId: string) => {
    const instances = [originalFlowRef.current, proposedFlowRef.current]
    let didFit = false
    instances.forEach((reactFlow) => {
      if (!reactFlow) return
      try {
        const a = reactFlow.getNode(sourceId)
        const b = reactFlow.getNode(targetId)
        const toFit: Node[] = [a, b].filter(Boolean) as Node[]
        if (toFit.length > 0) {
          ;(reactFlow.fitView as any)({ nodes: toFit, padding: 0.3, duration: 400 })
          didFit = true
        }
      } catch {}
    })
    if (didFit) {
      setTimeout(() => highlightRelatedNodes(sourceId, targetId), 450)
    } else {
      highlightRelatedNodes(sourceId, targetId)
    }
  }, [highlightRelatedNodes])

  const handleSelectRelated = useCallback((id: string) => {
    const current = activeNodeId
    if (current) {
      focusNodesAndHighlight(current, id)
    }
    setSelectedOriginalNodeId(id)
    setSelectedProposedNodeId(id)
  }, [activeNodeId, focusNodesAndHighlight])

  const buildPrimaryLink = useCallback((d: any) => {
    try { return getNormalizedLink(d || {}) } catch { return '' }
  }, [getNormalizedLink])

  // Helper: Collect unified array of extra links (normalized) for node data
  const collectExtraLinks = useCallback((d: any): string[] => {
    const items = buildExtraItems(d || {})
    return (items || [])
      .filter((it: any) => it?.type === 'link')
      .map((it: any) => normalizeExtraLink(String(it?.content || '')))
      .filter((s: string) => !!s)
  }, [buildExtraItems, normalizeExtraLink])

  const handleCompareArticle = useCallback((side: 'original' | 'proposed', link: string, extraIndex?: number) => {
    if (!onShowArticleComparison) return

    const oData = (activeOriginalNode as any)?.data || {}
    const pData = (activeProposedNode as any)?.data || {}

    const oPrimary = buildPrimaryLink(oData)
    const pPrimary = buildPrimaryLink(pData)

    // Default counterpart links are the primary links
    let originalLinkToUse = oPrimary
    let proposedLinkToUse = pPrimary

    if (typeof extraIndex === 'number') {
      // When clicking an extra link, don't fall back to primary link on the opposite side if no counterpart exists at the same index
      const oExtras = collectExtraLinks(oData)
      const pExtras = collectExtraLinks(pData)

      if (side === 'original') {
        // Original side: Use the clicked link; opposite side is either the counterpart at the same index or nothing
        originalLinkToUse = link || (oExtras[extraIndex] ?? '')
        proposedLinkToUse = (typeof pExtras[extraIndex] !== 'undefined') ? pExtras[extraIndex] : ''
      } else {
        // side === 'proposed'
        // Proposed side: Use the clicked link; opposite side is either the counterpart at the same index or nothing
        proposedLinkToUse = link || (pExtras[extraIndex] ?? '')
        originalLinkToUse = (typeof oExtras[extraIndex] !== 'undefined') ? oExtras[extraIndex] : ''
      }
    } else {
      // When clicking the primary link: previous behavior remains same
      if (side === 'original') {
        originalLinkToUse = link || oPrimary
        proposedLinkToUse = pPrimary
      } else {
        proposedLinkToUse = link || pPrimary
        originalLinkToUse = oPrimary
      }
    }

    onShowArticleComparison(originalLinkToUse, proposedLinkToUse)
  }, [onShowArticleComparison, activeOriginalNode, activeProposedNode, buildPrimaryLink, collectExtraLinks])

  // Apply highlight to nodes in both diagrams
  const originalNodesRendered = useMemo(() => {
    if (!highlightedNodeIds.length) return originalWithDiff.nodes
    return originalWithDiff.nodes.map((n: any) => (
      highlightedNodeIds.includes(n.id)
        ? { ...n, data: { ...(n.data as any), _highlight: true } }
        : { ...n, data: { ...(n.data as any), _highlight: undefined } }
    ))
  }, [originalWithDiff.nodes, highlightedNodeIds])

  const proposedNodesRendered = useMemo(() => {
    if (!highlightedNodeIds.length) return proposedWithDiff.nodes
    return proposedWithDiff.nodes.map((n: any) => (
      highlightedNodeIds.includes(n.id)
        ? { ...n, data: { ...(n.data as any), _highlight: true } }
        : { ...n, data: { ...(n.data as any), _highlight: undefined } }
    ))
  }, [proposedWithDiff.nodes, highlightedNodeIds])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-[420px] rounded-lg border border-gray-700 bg-black/20 p-2">
        <ReactFlow
          nodes={originalNodesRendered}
          edges={originalWithDiff.edges}
          nodeTypes={memoizedNodeTypes}
          fitView
          onInit={(instance) => { (originalFlowRef as any).current = instance }}
          onNodeClick={(_evt: any, node: any) => { setSelectedOriginalNodeId(node.id); setSelectedProposedNodeId(node.id) }}
          onPaneClick={() => { setSelectedOriginalNodeId(null); setSelectedProposedNodeId(null) }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <div className="h-[420px] rounded-lg border border-gray-700 bg-black/20 p-2">
        <ReactFlow
          nodes={proposedNodesRendered}
          edges={proposedWithDiff.edges}
          nodeTypes={memoizedNodeTypes}
          fitView
          onInit={(instance) => { (proposedFlowRef as any).current = instance }}
          onNodeClick={(_evt: any, node: any) => { setSelectedProposedNodeId(node.id); setSelectedOriginalNodeId(node.id) }}
          onPaneClick={() => { setSelectedOriginalNodeId(null); setSelectedProposedNodeId(null) }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {/* Flashcard display panel */}
      {(activeOriginalNode || activeProposedNode) && (
        <div className="md:col-span-2 card bg-stone-800/40 border border-amber-700/40 rounded-lg p-4">
          <div className="flex flex-col md:flex-row gap-6 overflow-hidden">
            <div className="flex-1 min-w-0">
              <FlashcardView
                data={(activeOriginalNode as any)?.data}
                title={t('flashcardTitleCurrent', { label: (activeOriginalNode as any)?.data?.label ? `- ${(activeOriginalNode as any).data.label}` : '' })}
                allNodes={originalWithDiff.nodes as any}
                onSelectNode={handleSelectRelated}
                side="original"
                onCompareArticle={handleCompareArticle}
              />
            </div>
            <div className="hidden md:block w-px bg-gray-700" />
            <div className="flex-1 min-w-0">
              <FlashcardView
                data={(activeProposedNode as any)?.data}
                title={t('flashcardTitleProposed', { label: (activeProposedNode as any)?.data?.label ? `- ${(activeProposedNode as any).data.label}` : '' })}
                allNodes={proposedWithDiff.nodes as any}
                onSelectNode={handleSelectRelated}
                side="proposed"
                onCompareArticle={handleCompareArticle}
              />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}