'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeTypes,
  Handle,
  Position,
  applyNodeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'
import QuickArticleModal from './QuickArticleModal'
import toast from 'react-hot-toast'
import { applyArticleTransforms } from '@/lib/footnotes'

interface FlashcardField {
  id: string
  type: 'text' | 'link'
  content: string
  draft?: { title: string; description?: string; content: string; slug: string; nodeId?: string; nodeLabel?: string }
}

type PreviewDraft = { title: string; description?: string; content: string }

const CustomNode = ({ data, isConnectable }: any) => {
  const t = useTranslations('treeDiagramEditor')
  // Check if the node has flashcard content (text, article link, or extra items)
  const hasFlashContent = () => {
    // Check flashcard text
    const hasFlashText = data?.flashText && String(data.flashText).trim().length > 0;
    
    // Check article link
    const hasArticleLink = data?.articleLink && String(data.articleLink).trim().length > 0;
    
    // Check extra items
    const hasExtraItems = data?.extraItems && Array.isArray(data.extraItems) && 
      data.extraItems.some((item: any) => item?.content && String(item.content).trim().length > 0);
    
    // Check old extra fields
    const hasExtraTexts = data?.extraTexts && Array.isArray(data.extraTexts) && 
      data.extraTexts.some((text: string) => text && String(text).trim().length > 0);
    
    const hasExtraLinks = data?.extraLinks && Array.isArray(data.extraLinks) && 
      data.extraLinks.some((link: string) => link && String(link).trim().length > 0);
    
    return hasFlashText || hasArticleLink || hasExtraItems || hasExtraTexts || hasExtraLinks;
  };

  return (
    <div
      className={`px-4 py-2 shadow-md rounded-md transition-colors duration-300 ${data?._highlight ? 'bg-amber-300' : 'bg-warm-cream'} min-w-[120px] ${
        hasFlashContent()
          ? 'border-4 border-amber-500'
          : 'border-2 border-stone-400'
      }`}
    >
      <Handle type="target" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 !bg-gray-600" />
      <div className="text-center">
        <div className="text-sm font-bold text-gray-800">{data.label}</div>
        {!!data?.domainName && !!data?._showDomainName && (
          <div className="text-[11px] text-gray-600 mt-0.5">{data.domainName}</div>
        )}
      </div>
      <Handle type="source" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 !bg-gray-600" />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

const edgeTypes = {}

interface TreeDiagramEditorProps {
  initialData?: { nodes: Node[]; edges: Edge[] }
  onDataChange?: (data: { nodes: Node[]; edges: Edge[] }) => void
  readOnly?: boolean
  height?: string
  hideArticleLinkInputs?: boolean
  collectDrafts?: boolean
  isCreatePage?: boolean
  showDomainNamesAtTop?: boolean
  actionsPortalId?: string
}

export default function TreeDiagramEditor({
  initialData,
  onDataChange,
  readOnly = false,
  height = '24rem',
  hideArticleLinkInputs = false,
  collectDrafts = false,
  isCreatePage = false,
  showDomainNamesAtTop = false,
  actionsPortalId,
}: TreeDiagramEditorProps) {
  const t = useTranslations('treeDiagramEditor')
  const { data: session } = useSession()
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialData?.nodes || [
      {
        id: '1',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: t('startNode') },
      },
    ]).map((n: any) => ({ ...n, data: { ...(n.data || {}), domainId: (n.data || {}).domainId ?? null, _readOnly: readOnly } }))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || [])
  const [nodeLabel, setNodeLabel] = useState('')
  const nodeIdRef = useRef(2)
  const [showDomainNames, setShowDomainNames] = useState(showDomainNamesAtTop)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (actionsPortalId) {
      const el = document.getElementById(actionsPortalId)
      if (el) setPortalTarget(el)
    }
  }, [actionsPortalId])

  useEffect(() => {
    setShowDomainNames(showDomainNamesAtTop)
  }, [showDomainNamesAtTop])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelSide, setPanelSide] = useState<'right' | 'left'>('right')
  const [flashText, setFlashText] = useState('')
  const [articleLink, setArticleLink] = useState('')

  const [flashcardFields, setFlashcardFields] = useState<FlashcardField[]>([])
  const createFieldId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

  // Temporary storage for extra link titles to display article titles for those links
  const [extraLinkTitles, setExtraLinkTitles] = useState<Record<string, string>>({})
  const [extraLinkContentCache, setExtraLinkContentCache] = useState<Record<string, string>>({})
  const [relatedNodeIds, setRelatedNodeIds] = useState<string[]>([])
  const [relationToAddId, setRelationToAddId] = useState<string>('')

  // Highlight state for related node interaction
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([])
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})

  const [domains, setDomains] = useState<Array<{ id: string; name: string }>>([])
  const domainNameById = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (let i = 0; i < domains.length; i++) {
      const d = domains[i]
      m[d.id] = d.name
    }
    return m
  }, [domains])

  // Temporarily highlight related nodes
  const highlightRelatedNodes = useCallback((sourceId: string, targetId: string) => {
    setHighlightedNodeIds([sourceId, targetId])
    setTimeout(() => setHighlightedNodeIds([]), 2000)
  }, [])

  // Save ReactFlow instance reference
  const reactFlowInstanceRef = useRef<any>(null)
  // Hydrate initialData into internal state only once
  const hasHydratedInitialData = useRef(false)
  
  // Focus view to include both nodes and then highlight them
  const focusNodesAndHighlight = useCallback((sourceId: string, targetId: string) => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      // Fallback: Just highlight if instance not available
      highlightRelatedNodes(sourceId, targetId)
      return
    }
    
    try {
      const a = reactFlow.getNode(sourceId)
      const b = reactFlow.getNode(targetId)
      const toFit: Node[] = [a, b].filter(Boolean) as Node[]
      if (toFit.length > 0) {
        // Fit view so both nodes are visible
        // padding ≈ 0.3 for a small margin; duration if supported transitions smoothly
        // No issue if current ReactFlow version ignores duration
        ;(reactFlow.fitView as any)({ nodes: toFit, padding: 0.3, duration: 400 })
        // Execute highlight shortly after view stabilizes
        setTimeout(() => highlightRelatedNodes(sourceId, targetId), 450)
        return
      }
    } catch {}
    // Fallback: Just highlight if node calculation fails
    highlightRelatedNodes(sourceId, targetId)
  }, [highlightRelatedNodes])

  // Compute nodes with highlight flags
  const computedNodes = React.useMemo(() => {
    const mapOne = (n: any, highlighted: boolean) => {
      const dataAny = (n.data as any) || {}
      const domainId = dataAny.domainId ?? null
      const domainName = domainId ? (domainNameById[String(domainId)] || '') : ''
      return {
        ...n,
        data: {
          ...dataAny,
          domainId,
          domainName,
          _showDomainName: showDomainNames ? true : undefined,
          _highlight: highlighted ? true : undefined,
        },
      }
    }
    if (!highlightedNodeIds.length) return nodes.map((n) => mapOne(n, false))
    return nodes.map((n) => mapOne(n, highlightedNodeIds.includes(n.id)))
  }, [nodes, highlightedNodeIds, domainNameById, showDomainNames])

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [modalTarget, setModalTarget] = useState<'main' | string | null>(null)
  const [nodeTitle, setNodeTitle] = useState('')

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...(n.data as any), _readOnly: readOnly } })))
  }, [readOnly, setNodes])

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        const res = await fetch('/api/admin/domains?mode=select', { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const items = Array.isArray((data as any)?.items) ? (data as any).items : []
        if (items.length > 0) {
          setDomains(items.filter((x: any) => x && typeof x.id === 'string' && typeof x.name === 'string'))
          return
        }
        const roots = Array.isArray((data as any)?.roots) ? (data as any).roots : []
        if (roots.length > 0) {
          const flat: Array<{ id: string; name: string }> = []
          const stack = [...roots]
          while (stack.length) {
            const n = stack.pop()
            if (n && typeof n.id === 'string' && typeof n.name === 'string') {
              flat.push({ id: n.id, name: n.name })
              if (Array.isArray(n.children)) {
                for (let i = 0; i < n.children.length; i++) stack.push(n.children[i])
              }
            }
          }
          flat.sort((a, b) => a.name.localeCompare(b.name))
          setDomains(flat)
        }
      } catch {}
    }
    run()
    return () => controller.abort()
  }, [])

  // Fetch article titles for extra link fields and the main article link to display as link text
  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      // 1) Main article link title (key 'main')
      try {
        if (articleLink && !articleLink.startsWith('http')) {
          if (extraLinkContentCache['main'] !== articleLink) {
            const slug = normalizeSlugFromLink(articleLink)
            if (slug) {
              const res = await fetch(`/api/articles/${encodeURIComponent(slug)}`, { signal: controller.signal })
              if (res.ok) {
                const article = await res.json()
                const title = article?.title || ''
                setExtraLinkTitles((prev) => ({ ...prev, main: title }))
              } else {
                setExtraLinkTitles((prev) => ({ ...prev, main: '' }))
              }
              setExtraLinkContentCache((prev) => ({ ...prev, main: articleLink }))
            }
          }
        } else {
          // External link or empty -> Clear stored title to avoid stale data
          setExtraLinkTitles((prev) => ({ ...prev, main: '' }))
          setExtraLinkContentCache((prev) => ({ ...prev, main: articleLink || '' }))
        }
      } catch (e) {
        // Ignore
      }

      // 2) Extra link fields
      const tasks = flashcardFields
        .filter((f) => f.type === 'link' && f.content && !f.content.startsWith('http'))
        .map(async (f) => {
          if (extraLinkContentCache[f.id] === f.content) return
          const slug = normalizeSlugFromLink(f.content)
          if (!slug) return
          try {
            const res = await fetch(`/api/articles/${encodeURIComponent(slug)}`, { signal: controller.signal })
            if (!res.ok) {
              setExtraLinkTitles((prev) => ({ ...prev, [f.id]: '' }))
              setExtraLinkContentCache((prev) => ({ ...prev, [f.id]: f.content }))
              return
            }
            const article = await res.json()
            const title = article?.title || ''
            setExtraLinkTitles((prev) => ({ ...prev, [f.id]: title }))
            setExtraLinkContentCache((prev) => ({ ...prev, [f.id]: f.content }))
          } catch (e) {
            // Ignore fetch errors (navigation/unmount)
          }
        })
      await Promise.all(tasks)
    }
    run()
    return () => controller.abort()
  }, [flashcardFields, articleLink])

  const [quickArticleModalEditMode, setQuickArticleModalEditMode] = useState(false)
  const [quickArticleExistingDraft, setQuickArticleExistingDraft] = useState<
    { title: string; description?: string; content: string; slug: string } | undefined
  >(undefined)

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null

  useEffect(() => {
    const uniqueDomains = Array.from(new Set(nodes.map(n => (n.data as any)?.domainId ?? null)))
    const fetchPermissions = async () => {
      const newPermissions: Record<string, boolean> = { ...permissions }
      let changed = false
      for (const domainId of Array.from(uniqueDomains)) {
        const key = domainId || 'null'
        if (newPermissions[key] === undefined) {
          try {
            const res = await fetch(`/api/diagram/can-edit?domainId=${domainId || ''}`)
            if (res.ok) {
              const data = await res.json()
              newPermissions[key] = data.authorized
              changed = true
            }
          } catch (error) {
            console.error('Error fetching permission for domain:', domainId, error)
          }
        }
      }
      if (changed) {
        setPermissions(newPermissions)
      }
    }
    fetchPermissions()
  }, [nodes])

  const checkPermission = useCallback(async (domainId: string | null) => {
    if (readOnly) return false
    
    const key = domainId || 'null'
    if (permissions[key] !== undefined) {
      if (!permissions[key]) {
        toast.error(t('permissionDenied'))
      }
      return permissions[key]
    }

    try {
      const res = await fetch(`/api/diagram/can-edit?domainId=${domainId || ''}`)
      if (!res.ok) return false
      const data = await res.json()
      if (!data.authorized) {
        toast.error(t('permissionDenied'))
        return false
      }
      return true
    } catch (error) {
      console.error('Error checking permission:', error)
      return false
    }
  }, [readOnly, permissions, t])

  useEffect(() => {
    const numericIds = nodes.map((n) => parseInt(n.id as string, 10)).filter((v) => !Number.isNaN(v))
    const nextId = (numericIds.length ? Math.max(...numericIds) : 0) + 1
    if (nodeIdRef.current < nextId) {
      nodeIdRef.current = nextId
    }
  }, [nodes])

  const onConnect = useCallback(
    async (params: Connection) => {
      if (readOnly) return

      const src = nodes.find((n) => n.id === params.source)
      const tgt = nodes.find((n) => n.id === params.target)
      const srcDomainId = (src?.data as any)?.domainId ?? null
      const tgtDomainId = (tgt?.data as any)?.domainId ?? null

      const isSrcAuthorized = await checkPermission(srcDomainId)
      if (!isSrcAuthorized) return
      const isTgtAuthorized = await checkPermission(tgtDomainId)
      if (!isTgtAuthorized) return

      const newEdge = addEdge(params, edges)
      let nextNodes = nodes
      if (params.source && params.target) {
        if (srcDomainId && (!tgtDomainId || String(tgtDomainId).trim() === '')) {
          nextNodes = nodes.map((n) => (
            n.id === params.target ? { ...n, data: { ...(n.data as any), domainId: srcDomainId } } : n
          ))
          setNodes(nextNodes)
        }
      }
      setEdges(newEdge)
      onDataChange?.({ nodes: nextNodes, edges: newEdge })
    },
    [edges, nodes, onDataChange, readOnly, setNodes, checkPermission]
  )

  const addNode = useCallback(
    async (e?: React.MouseEvent) => {
      if (readOnly || !nodeLabel.trim()) return

      const parentDomainId = selectedNodeId ? ((nodes.find((n) => n.id === selectedNodeId)?.data as any)?.domainId ?? null) : null
      const isAuthorized = await checkPermission(parentDomainId)
      if (!isAuthorized) return

      if (e) {
        e.preventDefault()
        e.stopPropagation()
      }

      const newNode: Node = {
        id: nodeIdRef.current.toString(),
        type: 'custom',
        position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
        data: {
          label: nodeLabel.trim(),
          flashText: '',
          articleLink: '',
          previousArticleLink: '',
          extraTexts: [],
          extraLinks: [],
          extraItems: [],
          relatedNodeIds: [],
          domainId: selectedNodeId ? ((nodes.find((n) => n.id === selectedNodeId)?.data as any)?.domainId ?? null) : null,
          _readOnly: readOnly,
        },
      }

      nodeIdRef.current += 1
      const newNodes = [...nodes, newNode]
      setNodes(newNodes)
      setNodeLabel('')
      onDataChange?.({ nodes: newNodes, edges })
    },
    [nodeLabel, nodes, edges, onDataChange, readOnly, selectedNodeId, checkPermission]
  )

  const deleteSelectedElements = useCallback(
    async (e?: React.MouseEvent) => {
      if (readOnly) return

      const selectedNodes = nodes.filter((node) => node.selected)
      const selectedEdges = edges.filter((edge) => edge.selected)

      // Check permissions for all affected domains
      const affectedDomains = new Set<string | null>()
      selectedNodes.forEach(n => affectedDomains.add((n.data as any)?.domainId ?? null))
      // For edges, check both source and target domains? 
      // Usually, if you can edit the node, you can edit its edges.
      // Let's check source and target nodes' domains for selected edges.
      selectedEdges.forEach(edge => {
        const srcNode = nodes.find(n => n.id === edge.source)
        const tgtNode = nodes.find(n => n.id === edge.target)
        if (srcNode) affectedDomains.add((srcNode.data as any)?.domainId ?? null)
        if (tgtNode) affectedDomains.add((tgtNode.data as any)?.domainId ?? null)
      })

      for (const domainId of Array.from(affectedDomains)) {
        const isAuthorized = await checkPermission(domainId)
        if (!isAuthorized) return
      }

      if (e) {
        e.preventDefault()
        e.stopPropagation()
      }
      const selectedNodeIds = selectedNodes.map((node) => node.id)

      if (selectedNodes.length === 0 && selectedEdges.length === 0) {
        return
      }

      // Delete nodes and associated edges, plus any individually selected edges
      let newNodes = nodes.filter((node) => !node.selected)
      const newEdges = edges.filter(
        (edge) =>
          !edge.selected &&
          !selectedNodeIds.includes(edge.source) &&
          !selectedNodeIds.includes(edge.target)
      )

      // Clean up associated references from other nodes
      newNodes = newNodes.map((n) => {
        const d: any = n.data || {}
        if (Array.isArray(d.relatedNodeIds) && d.relatedNodeIds.length > 0) {
          const filtered = d.relatedNodeIds.filter((id: string) => !selectedNodeIds.includes(id))
          if (filtered.length !== d.relatedNodeIds.length) {
            return { ...n, data: { ...d, relatedNodeIds: filtered } }
          }
        }
        return n
      })

      setNodes(newNodes)
      setEdges(newEdges)
      if (selectedNodeId && selectedNodeIds.includes(selectedNodeId)) {
        setSelectedNodeId(null)
        setPanelOpen(false)
      }
      onDataChange?.({ nodes: newNodes, edges: newEdges })
    },
    [nodes, edges, onDataChange, readOnly, selectedNodeId, setNodes, setEdges, checkPermission]
  )

  const handleNodesDelete = useCallback(
    async (deletedNodes: Node[]) => {
      // Check permissions for all affected domains
      const affectedDomains = new Set<string | null>()
      deletedNodes.forEach(n => affectedDomains.add((n.data as any)?.domainId ?? null))

      for (const domainId of Array.from(affectedDomains)) {
        const isAuthorized = await checkPermission(domainId)
        if (!isAuthorized) return
      }

      const deletedIds = deletedNodes.map((n) => n.id)
      let nextNodes = nodes.filter((n) => !deletedIds.includes(n.id))
      const nextEdges = edges.filter(
        (e) => !deletedIds.includes(e.source) && !deletedIds.includes(e.target)
      )

      // Clean up references
      nextNodes = nextNodes.map((n) => {
        const d: any = n.data || {}
        if (Array.isArray(d.relatedNodeIds)) {
          const filtered = d.relatedNodeIds.filter((id: string) => !deletedIds.includes(id))
          if (filtered.length !== d.relatedNodeIds.length) {
            return { ...n, data: { ...d, relatedNodeIds: filtered } }
          }
        }
        return n
      })

      setNodes(nextNodes)
      setEdges(nextEdges)
      if (selectedNodeId && deletedIds.includes(selectedNodeId)) {
        setSelectedNodeId(null)
        setPanelOpen(false)
      }
      onDataChange?.({ nodes: nextNodes, edges: nextEdges })
    },
    [nodes, edges, onDataChange, selectedNodeId, setNodes, setEdges, checkPermission]
  )

  const handleEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      // Check permissions for all affected domains
      const affectedDomains = new Set<string | null>()
      deletedEdges.forEach(edge => {
        const srcNode = nodes.find(n => n.id === edge.source)
        const tgtNode = nodes.find(n => n.id === edge.target)
        if (srcNode) affectedDomains.add((srcNode.data as any)?.domainId ?? null)
        if (tgtNode) affectedDomains.add((tgtNode.data as any)?.domainId ?? null)
      })

      for (const domainId of Array.from(affectedDomains)) {
        const isAuthorized = await checkPermission(domainId)
        if (!isAuthorized) return
      }

      const deletedIds = deletedEdges.map((e) => e.id)
      const nextEdges = edges.filter((e) => !deletedIds.includes(e.id))
      setEdges(nextEdges)
      onDataChange?.({ nodes, edges: nextEdges })
    },
    [nodes, edges, onDataChange, setEdges, checkPermission]
  )

  const handleNodesChange = useCallback(
    (changes: any) => {
      const newNodes = applyNodeChanges(changes, nodes)
      onNodesChange(changes)
      const hasPositionChange = changes.some((change: any) => change.type === 'position')
      if (hasPositionChange) {
        onDataChange?.({ nodes: newNodes, edges })
      }
    },
    [onNodesChange, nodes, edges, onDataChange]
  )

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setPanelOpen(true)
    setFlashText((node.data as any)?.flashText || '')
    setArticleLink((node.data as any)?.articleLink || '')
    setNodeTitle((node.data as any)?.label || '')
    const dataAny = (node.data as any) || {}
    let items: FlashcardField[] = []
    if (Array.isArray(dataAny.extraItems)) {
      items = dataAny.extraItems.map((it: any) => ({
        id: it.id || createFieldId(),
        type: it.type === 'link' ? 'link' : 'text',
        content: typeof it.content === 'string' ? it.content : '',
        draft: it.draft && typeof it.draft === 'object' ? it.draft : undefined,
      }))
    } else {
      const texts = (dataAny.extraTexts as string[]) || []
      const links = (dataAny.extraLinks as string[]) || []
      items = [
        ...texts.map((t: string) => ({ id: createFieldId(), type: 'text' as const, content: t || '' })),
        ...links.map((l: string) => ({ id: createFieldId(), type: 'link' as const, content: l || '' })),
      ]
    }

    // If no fields, create a default "text box" and save it via setNodes function
    if (items.length === 0) {
      items = [{ id: createFieldId(), type: 'text', content: '' }]
      setNodes((prev) => {
        const newNodes = prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...(n.data as any),
                  extraItems: items,
                  extraTexts: [],
                  extraLinks: [],
                },
              }
            : n
        )
        onDataChange?.({ nodes: newNodes, edges })
        return newNodes
      })
    }

    setFlashcardFields(items)
    setRelatedNodeIds(Array.isArray(dataAny.relatedNodeIds) ? dataAny.relatedNodeIds : [])
    setRelationToAddId('')
  }, [onDataChange, edges, createFieldId])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setPanelOpen(false)
  }, [])

  const updateFlashText = useCallback(
    async (text: string) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const next = nodes.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), flashText: text } } : n))
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges, checkPermission]
  )

  const updateArticleLink = useCallback(
    async (link: string) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const next = nodes.map((n) => {
        if (n.id !== selectedNodeId) return n
        const dataAny = (n.data as any) || {}
        const prevLink = (dataAny.articleLink || '').trim()
        const updatedData: any = { ...dataAny, articleLink: link, _readOnly: readOnly }
        if (prevLink && prevLink !== link) {
          updatedData.previousArticleLink = prevLink
        }
        return { ...n, data: updatedData }
      })
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges, readOnly, checkPermission]
  )

  const updateNodeLabel = useCallback(
    async (label: string) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const next = nodes.map((n) => (
        n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), label } } : n
      ))
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges, checkPermission]
  )

  const updateNodeDomainId = useCallback(
    async (domainId: string | null) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      // Check permission for current domain
      const isAuthorizedOld = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorizedOld) return
      // Check permission for new domain
      const isAuthorizedNew = await checkPermission(domainId)
      if (!isAuthorizedNew) return

      const next = nodes.map((n) => (
        n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), domainId } } : n
      ))
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges, checkPermission]
  )

  const normalizeSlugFromLink = (link: string): string => {
    try {
      let path = link || ''
      if (/^https?:\/\//i.test(link)) {
        const u = new URL(link)
        path = u.pathname
      }
      path = path.split('?')[0].split('#')[0]
      const after = path.replace(/^\/?articles\//, '')
      return decodeURIComponent(after.replace(/\/+$/g, ''))
    } catch {
      return (link || '').replace(/^\/?articles\//, '').replace(/\/+$/g, '')
    }
  }

  const updateFlashcardFields = useCallback(
    async (items: FlashcardField[]) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const next = nodes.map((n) => {
        if (n.id !== selectedNodeId) return n
        const extraTexts = items.filter((i) => i.type === 'text').map((i) => i.content)
        const extraLinks = items.filter((i) => i.type === 'link').map((i) => i.content)
        return {
          ...n,
          data: {
            ...(n.data as any),
            extraItems: items,
            extraTexts,
            extraLinks,
          },
        }
      })
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges]
  )

  // Helper function to update related nodes
  const updateRelatedNodes = useCallback(
    async (ids: string[]) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const next = nodes.map((n) => {
        if (n.id !== selectedNodeId) return n
        const dataAny = (n.data as any) || {}
        return { ...n, data: { ...dataAny, relatedNodeIds: ids } }
      })
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges, checkPermission]
  )

  const handleArticleCreated = useCallback(
    async (articleSlug: string, target: 'main' | string) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const link = `/articles/${articleSlug}`

      if (target === 'main') {
        setArticleLink(link)
        updateArticleLink(link)
        toast.success(t('articleLinkedToFlashcard'))
      } else {
        const next = flashcardFields.map((f) => (f.id === target ? { ...f, content: link } : f))
        setFlashcardFields(next)
        updateFlashcardFields(next)
        toast.success(t('articleLinkedToExtraLink'))
      }

      setModalTarget(null)
    },
    [selectedNodeId, nodes, updateArticleLink, flashcardFields, updateFlashcardFields, checkPermission, t]
  )

  const handleDraftCreated = useCallback(
    async (draft: { title: string; description?: string; content: string; slug: string }, target: 'main' | string) => {
      if (!selectedNodeId) return
      const node = nodes.find(n => n.id === selectedNodeId)
      const isAuthorized = await checkPermission((node?.data as any)?.domainId ?? null)
      if (!isAuthorized) return

      const link = `/articles/${draft.slug}`

      if (target === 'main') {
        setArticleLink(link)
        const next = nodes.map((n) => {
          if (n.id !== selectedNodeId) return n
          const nodeLabel = (n.data as any)?.label
          return {
            ...n,
            data: {
              ...(n.data as any),
              articleLink: link,
              articleDraft: { ...draft, nodeId: n.id, nodeLabel },
            },
          }
        })
        setNodes(next)
        onDataChange?.({ nodes: next, edges })
        toast.success(t('articleLinkedToFlashcard'))
      } else {
        const nodeLabel = (() => {
          try {
            const n = (nodes || []).find((nn) => nn.id === selectedNodeId)
            return (n?.data as any)?.label
          } catch {
            return undefined
          }
        })()
        const next = flashcardFields.map((f) => (
          f.id === target
            ? { ...f, content: link, draft: { ...draft, nodeId: selectedNodeId, nodeLabel } }
            : f
        ))
        setFlashcardFields(next)
        updateFlashcardFields(next)
        toast.success(t('articleLinkedToExtraLink'))
      }

      setModalTarget(null)
    },
    [selectedNodeId, updateArticleLink, flashcardFields, updateFlashcardFields, nodes, t]
  )

  const openCreateArticleModal = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setQuickArticleModalEditMode(false)
    setQuickArticleExistingDraft(undefined)
    setModalTarget('main')
  }, [])

  const openEditDraftArticleModal = useCallback(
    (nodeId: string, draft: { title: string; description?: string; content: string; slug: string }) => {
      setSelectedNodeId(nodeId)
      setQuickArticleModalEditMode(true)
      setQuickArticleExistingDraft(draft)
      setModalTarget('main')
    },
    []
  )

  const openEditExtraLinkModal = useCallback(
    async (fieldId: string, articleLink: string) => {
      try {
        const slug = normalizeSlugFromLink(articleLink)
        if (!slug) {
          toast.error(t('invalidSlug'))
          return
        }
        const res = await fetch(`/api/articles/${slug}`)
        if (!res.ok) {
          toast.error(t('fetchArticleError'))
          return
        }
        const article = await res.json()
        const draft = {
          title: article.title || t('noTitle'),
          description: article.description || '',
          content: article.content || '',
          slug,
        }
        setQuickArticleExistingDraft(draft)
        setQuickArticleModalEditMode(true)
        setModalTarget(fieldId)
      } catch (e) {
        console.error(e)
        toast.error(t('prepareEditError'))
      }
    },
    [t]
  )

  const handleNodeDoubleClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    if (readOnly || !isCreatePage) return

    const isAuthorized = await checkPermission((node.data as any)?.domainId ?? null)
    if (!isAuthorized) return

    const current = (node.data as any)?.label || ''
    const newLabel = window.prompt(t('nodePrompt'), current)
    if (newLabel === null) return
    const trimmed = newLabel.trim()
    const next = nodes.map((n) => (
      n.id === node.id ? { ...n, data: { ...(n.data as any), label: trimmed } } : n
    ))
    setNodes(next)
    onDataChange?.({ nodes: next, edges })
    setSelectedNodeId(node.id)
    setNodeTitle(trimmed)
    toast.success(t('nodeLabelUpdated'))
  }, [readOnly, isCreatePage, nodes, edges, onDataChange, t, checkPermission])

  useEffect(() => {
    if (!isPreviewOpen || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isPreviewOpen])

  // Sync internal state with incoming initialData when it changes
  useEffect(() => {
    if (!initialData) return
    if (hasHydratedInitialData.current) return

    const nextNodes = (initialData.nodes || []).map((n: any) => ({
      ...n,
      data: { ...(n.data || {}), domainId: (n.data || {}).domainId ?? null, _readOnly: readOnly },
    }))
    const nextEdges = initialData.edges || []
    setNodes(nextNodes)
    setEdges(nextEdges)
    if (selectedNodeId && !nextNodes.find((n) => n.id === selectedNodeId)) {
      setSelectedNodeId(null)
      setPanelOpen(false)
    }
    hasHydratedInitialData.current = true
  }, [initialData, readOnly])

  return (
    <div className="w-full border border-site-border rounded-lg overflow-hidden flex flex-col" style={{ height }}>
      {!readOnly ? (
        <div className="p-4 bg-site-secondary border-b border-site-border flex gap-2 items-center">
          <input
            type="text"
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            placeholder={t('newNodePlaceholder')}
            className="flex-1 px-3 py-2 border border-site-border rounded-md text-sm bg-site-card text-site-text placeholder-site-muted"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addNode()
              }
            }}
          />
          <button type="button" onClick={addNode} disabled={!nodeLabel.trim()} className="px-4 py-2 bg-site-card text-site-text border border-site-border rounded-md text-sm hover:bg-site-secondary disabled:opacity-50">
            {t('addNode')}
          </button>
          <button type="button" onClick={deleteSelectedElements} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
            {t('deleteSelected')}
          </button>
          {portalTarget ? (
            createPortal(
              <button
                type="button"
                onClick={() => setShowDomainNames((prev) => !prev)}
                className="px-4 py-2 bg-site-card text-site-text border border-site-border rounded-md text-sm hover:bg-site-secondary"
              >
                {showDomainNames ? t('hideDomainNames') : t('showDomainNames')}
              </button>,
              portalTarget
            )
          ) : (
            <button
              type="button"
              onClick={() => setShowDomainNames((prev) => !prev)}
              className="px-4 py-2 bg-site-card text-site-text border border-site-border rounded-md text-sm hover:bg-site-secondary"
            >
              {showDomainNames ? t('hideDomainNames') : t('showDomainNames')}
            </button>
          )}
        </div>
      ) : (
        <div className="p-3 bg-site-secondary border-b border-site-border flex justify-end">
          <div id="tree-actions-portal-target" className="flex items-center gap-2">
            {portalTarget ? (
              createPortal(
                <button
                  type="button"
                  onClick={() => setShowDomainNames((prev) => !prev)}
                  className="px-3 py-1.5 bg-site-card text-site-text border border-site-border rounded-md text-sm hover:bg-site-secondary"
                >
                  {showDomainNames ? t('hideDomainNames') : t('showDomainNames')}
                </button>,
                portalTarget
              )
            ) : (
              <button
                type="button"
                onClick={() => setShowDomainNames((prev) => !prev)}
                className="px-3 py-1.5 bg-site-card text-site-text border border-site-border rounded-md text-sm hover:bg-site-secondary"
              >
                {showDomainNames ? t('hideDomainNames') : t('showDomainNames')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="h-full flex-1 flex min-h-0">
        <div className="flex-1 min-h-0">
          <ReactFlow
            nodes={computedNodes}
            edges={edges}
             onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onConnect={onConnect}
             onNodeClick={handleNodeClick}
             onPaneClick={handlePaneClick}
             nodeTypes={nodeTypes}
             edgeTypes={edgeTypes}
             fitView
             attributionPosition="bottom-left"
             nodesDraggable={!readOnly}
             nodesConnectable={!readOnly}
             elementsSelectable={!readOnly}
             onInit={(instance) => { reactFlowInstanceRef.current = instance }}
             onNodeDoubleClick={handleNodeDoubleClick}
             style={{ width: '100%', height: '100%' }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div className="w-full lg:w-1/3 h-full overflow-y-auto p-4 bg-site-card border border-site-border rounded-lg">
            <h4 className="font-semibold text-site-text">{t('flashcardTitle', { label: selectedNode?.data?.label })}</h4>

            <div className="mt-3">
              <label className="block text-sm text-site-muted mb-1">{t('domainLabel')}</label>
              <select
                className="w-full p-2 rounded border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm disabled:opacity-70"
                value={String(((selectedNode?.data as any)?.domainId || '') as any)}
                disabled={
                  readOnly ||
                  !(session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPERVISOR' || isCreatePage)
                }
                onChange={(e) => {
                  const v = e.target.value
                  updateNodeDomainId(v ? v : null)
                }}
              >
                <option value="">{t('noSelection')}</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {isCreatePage && !readOnly && (
              <div className="mt-3">
                <label className="block text-sm text-site-muted mb-1">{t('nodeName')}</label>
                <input
                  type="text"
                  className="w-full p-2 rounded border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm"
                  value={nodeTitle}
                  onChange={(e) => {
                    const v = e.target.value
                    setNodeTitle(v)
                    updateNodeLabel(v)
                  }}
                  placeholder={t('nodeNamePlaceholder')}
                />
              </div>
            )}
            {/* Text 1 before the first link */}
            {(() => {
              const firstTextIndex = flashcardFields.findIndex((f) => f.type === 'text')
              if (firstTextIndex < 0) return null
              const field = flashcardFields[firstTextIndex]
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-site-muted">{t('textLabel', { number: 1 })}</label>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = flashcardFields.filter((_, i) => i !== firstTextIndex)
                          setFlashcardFields(next)
                          updateFlashcardFields(next)
                        }}
                        className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full mt-1 p-2 rounded border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm"
                    rows={6}
                    value={field.content}
                    readOnly={readOnly}
                    disabled={readOnly}
                    onChange={(e) => {
                      if (readOnly) return
                      const value = e.target.value
                      const next = flashcardFields.map((f, i) => (i === firstTextIndex ? { ...f, content: value } : f))
                      setFlashcardFields(next)
                      updateFlashcardFields(next)
                    }}
                    placeholder={t('textPlaceholder')}
                  />
                </div>
              )
            })()}

            {/* First Link (Main Article Link) */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-site-muted">{t('firstLink')}</label>
                 {!readOnly && (
                   <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickArticleModalEditMode(false)
                        setQuickArticleExistingDraft(undefined)
                        setModalTarget('main')
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 underline bg-transparent border-none cursor-pointer"
                    >
                      {t('createAndLinkAuto')}
                    </button>
                    {articleLink && (
                      <button
                        type="button"
                        onClick={() => {
                          setArticleLink('')
                          updateArticleLink('')
                        }}
                        className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!hideArticleLinkInputs && (
                <input
                  type="text"
                  className="w-full mt-1 p-2 rounded border border-site-border bg-site-bg text-blue-600 placeholder-site-muted caret-blue-600 focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm"
                  value={articleLink}
                  readOnly={readOnly}
                  disabled={readOnly}
                  onChange={(e) => {
                    if (readOnly) return
                    const value = e.target.value
                    setArticleLink(value)
                    updateArticleLink(value)
                  }}
                  onDoubleClick={() => {
                    if (articleLink) {
                      let link = articleLink.trim()
                      if (!/^https?:\/\//i.test(link)) {
                        link = link.replace(/^https?:\/\/[^/]+/i, '')
                        if (!link.startsWith('/')) link = '/' + link
                      }
                      window.open(link, '_blank')
                    }
                  }}
                  placeholder={t('linkPlaceholderDetailed')}
                />
              )}
              {articleLink && (
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    let displayLink = (articleLink || '').trim()
                    if (!/^https?:\/\//i.test(displayLink)) {
                      displayLink = displayLink.replace(/^https?:\/\/[^/]+/i, '')
                      if (!displayLink.startsWith('/')) displayLink = '/' + displayLink
                    }
                    // Create a friendly label for the main link similar to extra links: prefer fetched title
                    let label: string
                    const isExternal = /^https?:\/\//i.test(articleLink)
                    if (!isExternal) {
                      const slug = normalizeSlugFromLink(articleLink)
                      const fallback = slug ? slug.replace(/-/g, ' ') : displayLink
                      label = (extraLinkTitles['main'] || '').trim() || fallback || t('view')
                    } else {
                      try {
                        const u = new URL(articleLink)
                        label = u.pathname && u.pathname !== '/' ? u.pathname.slice(1) : u.hostname
                      } catch {
                        label = displayLink || t('view')
                      }
                    }
                    return (
                      <a
                        href={displayLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline text-xs"
                        title={displayLink}
                      >
                        {label}
                      </a>
                    )
                  })()}
                  {isCreatePage && !readOnly && articleLink.startsWith('/articles/') && (
                    <button
                      type="button"
                      onClick={() => openEditExtraLinkModal('main', articleLink)}
                      className="text-amber-400 hover:text-amber-300 underline text-xs"
                    >
                      {t('edit')}
                    </button>
                  )}
                  {!isCreatePage && !readOnly && (selectedNode?.data as any)?.articleDraft && (
                    <button
                      onClick={() => openEditDraftArticleModal(selectedNode!.id, (selectedNode!.data as any).articleDraft)}
                      className="text-amber-400 hover:text-amber-300 underline text-xs"
                    >
                      {t('editDraft')}
                    </button>
                  )}
                  {!isCreatePage && !readOnly && articleLink.startsWith('/articles/') && !(selectedNode?.data as any)?.articleDraft && (
                    <>
                      <a href={`${articleLink}/edit`} target="_blank" className="text-amber-400 hover:text-amber-300 underline text-xs">
                        {t('directEdit')}
                      </a>
                      {collectDrafts && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const slug = normalizeSlugFromLink(articleLink)
                              if (!slug) {
                                toast.error(t('invalidSlug'))
                                return
                              }
                              const res = await fetch(`/api/articles/${slug}`)
                              if (!res.ok) {
                                toast.error(t('fetchArticleError'))
                                return
                              }
                              const article = await res.json()
                              const draft = {
                                title: article.title || selectedNode!.data?.label || t('noTitle'),
                                description: article.description || '',
                                content: article.content || '',
                                slug,
                              }
                              setQuickArticleExistingDraft(draft)
                              setQuickArticleModalEditMode(true)
                              setModalTarget('main')
                            } catch (e) {
                              console.error(e)
                              toast.error(t('prepareEditError'))
                            }
                          }}
                          className="text-blue-300 hover:text-blue-200 underline text-xs"
                        >
                          {t('proposedEdit')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>


            {flashcardFields.map((field, idx) => (
              idx === flashcardFields.findIndex((f) => f.type === 'text')
                ? null
                : (
                  <div key={field.id} className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-site-muted">
                        {field.type === 'text'
                          ? t('textLabel', { number: flashcardFields.slice(0, idx + 1).filter((f) => f.type === 'text').length })
                          : (() => {
                              const linkOrder = flashcardFields
                                .slice(0, idx + 1)
                                .filter((f) => f.type === 'link').length
                              const base = (articleLink && articleLink.trim()) ? 1 : 0
                              const linkNumber = base + linkOrder
                              const ord = [
                                t('ordinals.first'),
                                t('ordinals.second'),
                                t('ordinals.third'),
                                t('ordinals.fourth'),
                                t('ordinals.fifth'),
                                t('ordinals.sixth'),
                                t('ordinals.seventh'),
                                t('ordinals.eighth'),
                                t('ordinals.ninth'),
                                t('ordinals.tenth')
                              ]
                              const ordLabel = ord[linkNumber - 1] || String(linkNumber)
                              return t('linkWithOrdinal', { ordinal: ordLabel })
                            })()}
                      </label>
                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          {field.type === 'link' && (
                            <button
                              type="button"
                              onClick={() => setModalTarget(field.id)}
                              className="text-xs text-amber-400 hover:text-amber-300 underline bg-transparent border-none cursor-pointer"
                            >
                              {t('createAndLinkAuto')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const next = flashcardFields.filter((_, i) => i !== idx)
                              setFlashcardFields(next)
                              updateFlashcardFields(next)
                              if (editingFieldId === field.id) {
                                setEditingFieldId(null)
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      )}
                    </div>
                    {field.type === 'text' ? (
                      <textarea
                        className="w-full mt-1 p-2 rounded border border-site-border bg-site-bg text-site-text focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm"
                        rows={6}
                        value={field.content}
                        readOnly={readOnly}
                        disabled={readOnly}
                        onChange={(e) => {
                          if (readOnly) return
                          const value = e.target.value
                          const next = flashcardFields.map((f, i) => (i === idx ? { ...f, content: value } : f))
                          setFlashcardFields(next)
                          updateFlashcardFields(next)
                      }}
                      placeholder={t('textPlaceholder')}
                    />
                  ) : (
                    !hideArticleLinkInputs ? (
                      <input
                        type="text"
                        className="w-full mt-1 p-2 rounded border border-site-border bg-site-bg text-blue-600 placeholder-site-muted caret-blue-600 focus:outline-none focus:ring-2 focus:ring-warm-primary/60 text-sm"
                        value={field.content}
                        readOnly={readOnly}
                        disabled={readOnly}
                        onChange={(e) => {
                          if (readOnly) return
                          const value = e.target.value
                          const next = flashcardFields.map((f, i) => (i === idx ? { ...f, content: value } : f))
                          setFlashcardFields(next)
                          updateFlashcardFields(next)
                        }}
                        placeholder={t('linkPlaceholderDetailed')}
                      />
                    ) : null
                  )}
                  {field.type === 'link' && field.content ? (
                    (() => {
                      const isExternal = field.content.startsWith('http')
                      const href = isExternal
                        ? field.content
                        : `/articles/${normalizeSlugFromLink(field.content)}`

                      // Calculate friendly label: prefer fetched article title; otherwise fallback to slug/path
                      let label = t('viewArticle')
                      if (!isExternal) {
                        const slug = normalizeSlugFromLink(field.content)
                        label = extraLinkTitles[field.id] || (slug ? slug.replace(/-/g, ' ') : field.content)
                      } else {
                        try {
                          const u = new URL(field.content)
                          label = u.pathname && u.pathname !== '/' ? u.pathname.slice(1) : u.hostname
                        } catch {
                          label = field.content
                        }
                      }

                      return (
                        <div className="flex items-center gap-2 mt-1">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline text-xs"
                            title={href}
                          >
                            {label}
                          </a>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => openEditExtraLinkModal(field.id, field.content)}
                              className="text-amber-400 hover:text-amber-300 underline text-xs"
                            >
                              {t('edit')}
                            </button>
                          )}
                        </div>
                      )
                    })()
                  ) : null}
                  </div>
                )
            ))}

            {!readOnly && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = [...flashcardFields, { id: createFieldId(), type: 'text' as const, content: '' }]
                    setFlashcardFields(next)
                    updateFlashcardFields(next)
                  }}
                  className="px-3 py-1 rounded border border-site-border text-site-text hover:bg-site-secondary text-xs"
                >
                  {t('addTextField')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...flashcardFields, { id: createFieldId(), type: 'link' as const, content: '' }]
                    setFlashcardFields(next)
                    updateFlashcardFields(next)
                  }}
                  className="px-3 py-1 rounded border border-site-border text-site-text hover:bg-site-secondary text-xs"
                >
                  {t('addLinkField')}
                </button>
              </div>
            )}

            {/* Related nodes (linked to) — bottom section of the flashcard */}
            {(relatedNodeIds.length > 0 || !readOnly) && (
              <div className="mt-4 pt-3 border-t border-site-border">
                <label className="block text-sm text-site-muted mb-1">{t('relatedTo')}</label>
                <div className="flex flex-wrap gap-2">
                  {relatedNodeIds.length === 0 && (
                    <span className="text-xs text-site-muted">{t('noNodeSelected')}</span>
                  )}
                  {relatedNodeIds.map((rid) => {
                    const rn = nodes.find((n) => n.id === rid)
                    const label = (rn?.data as any)?.label || t('nodeLabelWithId', { id: rid })
                    return (
                      <span key={rid} className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedNodeId) return
                            focusNodesAndHighlight(selectedNodeId, rid)
                          }}
                          className="px-2 py-1 rounded border border-site-border bg-site-secondary text-site-text text-xs hover:bg-site-card"
                          title={t('highlightRelationWithLabel', { label })}
                        >
                          {label}
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = relatedNodeIds.filter((id) => id !== rid)
                              setRelatedNodeIds(next)
                              updateRelatedNodes(next)
                            }}
                            className="text-red-400 hover:text-red-300"
                            aria-label={t('deleteRelation')}
                            title={t('delete')}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      className="px-2 py-1 rounded border border-site-border bg-site-bg text-site-text text-xs min-w-[160px]"
                      value={relationToAddId}
                      onChange={(e) => setRelationToAddId(e.target.value)}
                    >
                      <option value="">{t('selectNodePlaceholder')}</option>
                      {nodes
                        .filter((n) => n.id !== selectedNodeId && !relatedNodeIds.includes(n.id))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {(n.data as any)?.label || t('nodeLabelWithId', { id: n.id })}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!relationToAddId}
                      onClick={() => {
                        if (!relationToAddId) return
                        const next = [...relatedNodeIds, relationToAddId]
                        setRelatedNodeIds(next)
                        updateRelatedNodes(next)
                        setRelationToAddId('')
                      }}
                      className="px-3 py-1 rounded border border-site-border text-site-text hover:bg-site-secondary text-xs disabled:opacity-50"
                    >
                      {t('add')}
                    </button>
                    {relatedNodeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRelatedNodeIds([])
                          updateRelatedNodes([])
                        }}
                        className="px-3 py-1 rounded border border-red-600/40 text-red-600 hover:bg-red-500/10 text-xs"
                      >
                        {t('deleteAll')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <QuickArticleModal
        isOpen={!readOnly && modalTarget !== null}
        onClose={() => {
          setModalTarget(null)
          setQuickArticleModalEditMode(false)
          setQuickArticleExistingDraft(undefined)
        }}
        onArticleCreated={(slug) => handleArticleCreated(slug, modalTarget!)}
        createViaAPI={!collectDrafts}
        onDraftCreated={(draft) => handleDraftCreated(draft, modalTarget!)}
        editMode={quickArticleModalEditMode}
        existingDraft={quickArticleExistingDraft}
      />

      {isPreviewOpen && previewDraft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">{previewDraft.title}</h3>
              <button
                onClick={() => {
                  setIsPreviewOpen(false)
                  setPreviewDraft(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            {previewDraft.description && <p className="text-gray-600 mb-4 italic">{previewDraft.description}</p>}
            <div
              className="prose prose-gray max-w-none whitespace-pre-wrap text-gray-800"
              dangerouslySetInnerHTML={{ __html: applyArticleTransforms(previewDraft.content || '') }}
            ></div>
          </div>
        </div>
      )}
    </div>
  )
}
