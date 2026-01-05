'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
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
  // التحقّق مما إذا كانت العقدة تحتوي على محتوى بطاقة تعليمية (نص، رابط مقال، أو عناصر إضافية)
  const hasFlashContent = () => {
    // التحقّق من نص البطاقة
    const hasFlashText = data?.flashText && String(data.flashText).trim().length > 0;
    
    // التحقّق من رابط المقال
    const hasArticleLink = data?.articleLink && String(data.articleLink).trim().length > 0;
    
    // التحقّق من العناصر الإضافية
    const hasExtraItems = data?.extraItems && Array.isArray(data.extraItems) && 
      data.extraItems.some((item: any) => item?.content && String(item.content).trim().length > 0);
    
    // التحقّق من الحقول الإضافية القديمة
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
}

export default function TreeDiagramEditor({
  initialData,
  onDataChange,
  readOnly = false,
  height = '24rem',
  hideArticleLinkInputs = false,
  collectDrafts = false,
  isCreatePage = false,
}: TreeDiagramEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (initialData?.nodes || [
      {
        id: '1',
        type: 'custom',
        position: { x: 400, y: 200 },
        data: { label: 'ابدأ' },
      },
    ]).map((n: any) => ({ ...n, data: { ...(n.data || {}), _readOnly: readOnly } }))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || [])
  const [nodeLabel, setNodeLabel] = useState('')
  const nodeIdRef = useRef(2)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelSide, setPanelSide] = useState<'right' | 'left'>('right')
  const [flashText, setFlashText] = useState('')
  const [articleLink, setArticleLink] = useState('')

  const [flashcardFields, setFlashcardFields] = useState<FlashcardField[]>([])
  const createFieldId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

  // مخزن مؤقّت لعناوين الروابط الإضافية لعرض عناوين المقالات لتلك الروابط
  const [extraLinkTitles, setExtraLinkTitles] = useState<Record<string, string>>({})
  const [extraLinkContentCache, setExtraLinkContentCache] = useState<Record<string, string>>({})
  const [relatedNodeIds, setRelatedNodeIds] = useState<string[]>([])
  const [relationToAddId, setRelationToAddId] = useState<string>('')

  // حالة التمييز لتفاعل العُقَد المرتبطة
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([])

  // تمييز العُقَد المرتبطة مؤقتًا
  const highlightRelatedNodes = useCallback((sourceId: string, targetId: string) => {
    setHighlightedNodeIds([sourceId, targetId])
    setTimeout(() => setHighlightedNodeIds([]), 2000)
  }, [])

  // حفظ مرجع كائن ReactFlow
  const reactFlowInstanceRef = useRef<any>(null)
  // فقط یکبار initialData را به state داخلی Hydrate کنیم
  const hasHydratedInitialData = useRef(false)
  
  // تركيز المنظور ليشمل العقدتين ثم تمييزهما
  const focusNodesAndHighlight = useCallback((sourceId: string, targetId: string) => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      // بديل: قم بالتمييز فقط إذا لم يتوفر الكائن
      highlightRelatedNodes(sourceId, targetId)
      return
    }
    
    try {
      const a = reactFlow.getNode(sourceId)
      const b = reactFlow.getNode(targetId)
      const toFit: Node[] = [a, b].filter(Boolean) as Node[]
      if (toFit.length > 0) {
        // ملاءمة العرض بحيث تصبح العقدتان مرئيتين
        // قيمة padding ≈ 0.3 من أجل هامش بسيط؛ والمدة إن كانت مدعومة تُحوِّل الانتقال بسلاسة
        // لا مشكلة إذا تجاهل الإصدار الحالي من ReactFlow قيمة المدة
        ;(reactFlow.fitView as any)({ nodes: toFit, padding: 0.3, duration: 400 })
        // تنفيذ التمييز بعد أن يستقرّ المنظور بقليل
        setTimeout(() => highlightRelatedNodes(sourceId, targetId), 450)
        return
      }
    } catch {}
    // بديل: قم بالتمييز فقط إذا تعذّر حساب العقد
    highlightRelatedNodes(sourceId, targetId)
  }, [highlightRelatedNodes])

  // حساب العقد مع أعلام التمييز
  const computedNodes = React.useMemo(() => {
    if (!highlightedNodeIds.length) return nodes.map(n => ({ ...n, data: { ...(n.data as any), _highlight: undefined } }))
    return nodes.map((n) => (
      highlightedNodeIds.includes(n.id)
        ? { ...n, data: { ...(n.data as any), _highlight: true } }
        : { ...n, data: { ...(n.data as any), _highlight: undefined } }
    ))
  }, [nodes, highlightedNodeIds])

  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [modalTarget, setModalTarget] = useState<'main' | string | null>(null)
  const [nodeTitle, setNodeTitle] = useState('')

  useEffect(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...(n.data as any), _readOnly: readOnly } })))
  }, [readOnly, setNodes])

  // جلب عناوين المقالات لحقول الروابط الإضافية وكذلك للرابط الرئيسي للمقال لعرضها كنص الرابط
  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      // 1) عنوان الرابط الرئيسي للمقال (المفتاح 'main')
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
          // رابط خارجي أو فارغ -> امسح العنوان المخزَّن لتفادي عرض بيانات قديمة
          setExtraLinkTitles((prev) => ({ ...prev, main: '' }))
          setExtraLinkContentCache((prev) => ({ ...prev, main: articleLink || '' }))
        }
      } catch (e) {
        // تجاهل
      }

      // 2) حقول الروابط الإضافية
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
            // تجاهُل أخطاء الجلب (التنقّل/تفكيك المكوّن)
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
    const numericIds = nodes.map((n) => parseInt(n.id as string, 10)).filter((v) => !Number.isNaN(v))
    const nextId = (numericIds.length ? Math.max(...numericIds) : 0) + 1
    if (nodeIdRef.current < nextId) {
      nodeIdRef.current = nextId
    }
  }, [nodes])

  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return
      const newEdge = addEdge(params, edges)
      setEdges(newEdge)
      onDataChange?.({ nodes, edges: newEdge })
    },
    [edges, nodes, onDataChange, readOnly]
  )

  const addNode = useCallback(
    (e?: React.MouseEvent) => {
      if (readOnly || !nodeLabel.trim()) return
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
          _readOnly: readOnly,
        },
      }

      nodeIdRef.current += 1
      const newNodes = [...nodes, newNode]
      setNodes(newNodes)
      setNodeLabel('')
      onDataChange?.({ nodes: newNodes, edges })
    },
    [nodeLabel, nodes, edges, onDataChange, readOnly]
  )

  const deleteSelectedNodes = useCallback(
    (e?: React.MouseEvent) => {
      if (readOnly) return
      if (e) {
        e.preventDefault()
        e.stopPropagation()
      }

      const selectedNodes = nodes.filter((node) => node.selected)
      const selectedNodeIds = selectedNodes.map((node) => node.id)

      // حذف العقد والحواف المرتبطة
      let newNodes = nodes.filter((node) => !node.selected)
      const newEdges = edges.filter((edge) => !selectedNodeIds.includes(edge.source) && !selectedNodeIds.includes(edge.target))

      // تنظيف المراجع المرتبطة من العقد الأخرى
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
    [nodes, edges, onDataChange, readOnly, selectedNodeId]
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

    // اگر هیچ فیلدی نیست، یک «کادر متن» پیش‌فرض بساز و با setNodes تابعی ذخیره کن
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
    (text: string) => {
      if (!selectedNodeId) return
      const next = nodes.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), flashText: text } } : n))
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges]
  )

  const updateArticleLink = useCallback(
    (link: string) => {
      if (!selectedNodeId) return
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
    [selectedNodeId, nodes, setNodes, onDataChange, edges, readOnly]
  )

  const updateNodeLabel = useCallback(
    (label: string) => {
      if (!selectedNodeId) return
      const next = nodes.map((n) => (
        n.id === selectedNodeId ? { ...n, data: { ...(n.data as any), label } } : n
      ))
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges]
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
    (items: FlashcardField[]) => {
      if (!selectedNodeId) return
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

  // دالّة مساعدة لتحديث العقد المرتبطة
  const updateRelatedNodes = useCallback(
    (ids: string[]) => {
      if (!selectedNodeId) return
      const next = nodes.map((n) => {
        if (n.id !== selectedNodeId) return n
        const dataAny = (n.data as any) || {}
        return { ...n, data: { ...dataAny, relatedNodeIds: ids } }
      })
      setNodes(next)
      onDataChange?.({ nodes: next, edges })
    },
    [selectedNodeId, nodes, setNodes, onDataChange, edges]
  )

  const handleArticleCreated = useCallback(
    (articleSlug: string, target: 'main' | string) => {
      if (!selectedNodeId) return
      const link = `/articles/${articleSlug}`

      if (target === 'main') {
        setArticleLink(link)
        updateArticleLink(link)
        toast.success('تم ربط مسودة المقال ببطاقة البيانات')
      } else {
        const next = flashcardFields.map((f) => (f.id === target ? { ...f, content: link } : f))
        setFlashcardFields(next)
        updateFlashcardFields(next)
        toast.success('تم ربط مسودة المقال بالرابط الإضافي')
      }

      setModalTarget(null)
    },
    [selectedNodeId, updateArticleLink, flashcardFields, updateFlashcardFields]
  )

  const handleDraftCreated = useCallback(
    (draft: { title: string; description?: string; content: string; slug: string }, target: 'main' | string) => {
      if (!selectedNodeId) return
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
        toast.success('تم ربط مسودة المقال ببطاقة البيانات')
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
        toast.success('تم ربط مسودة المقال بالرابط الإضافي')
      }

      setModalTarget(null)
    },
    [selectedNodeId, updateArticleLink, flashcardFields, updateFlashcardFields, nodes]
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
          toast.error('المعرّف (slug) الخاص بالمقال غير صالح')
          return
        }
        const res = await fetch(`/api/articles/${slug}`)
        if (!res.ok) {
          toast.error('خطأ في جلب المقال')
          return
        }
        const article = await res.json()
        const draft = {
          title: article.title || 'بدون عنوان',
          description: article.description || '',
          content: article.content || '',
          slug,
        }
        setQuickArticleExistingDraft(draft)
        setQuickArticleModalEditMode(true)
        setModalTarget(fieldId)
      } catch (e) {
        console.error(e)
        toast.error('خطأ في تحضير التحرير المقترح')
      }
    },
    []
  )

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (readOnly || !isCreatePage) return
    const current = (node.data as any)?.label || ''
    const newLabel = window.prompt('أدخل اسم العقدة الجديد:', current)
    if (newLabel === null) return
    const trimmed = newLabel.trim()
    const next = nodes.map((n) => (
      n.id === node.id ? { ...n, data: { ...(n.data as any), label: trimmed } } : n
    ))
    setNodes(next)
    onDataChange?.({ nodes: next, edges })
    setSelectedNodeId(node.id)
    setNodeTitle(trimmed)
    toast.success('تم تحديث اسم العقدة')
  }, [readOnly, isCreatePage, nodes, edges, onDataChange])

  useEffect(() => {
    if (!isPreviewOpen || typeof window === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isPreviewOpen])

  // مزامنة الحالة الداخلية مع initialData الواردة عند تغيّرها
  useEffect(() => {
    if (!initialData) return
    if (hasHydratedInitialData.current) return

    const nextNodes = (initialData.nodes || []).map((n: any) => ({
      ...n,
      data: { ...(n.data || {}), _readOnly: readOnly },
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
    <div className="w-full border border-gray-300 rounded-lg overflow-hidden flex flex-col" style={{ height }}>
      {!readOnly && (
        <div className="p-4 bg-gray-800 border-b flex gap-2 items-center">
          <input
            type="text"
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            placeholder="نص العقدة الجديدة..."
            className="flex-1 px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-white placeholder-gray-400"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addNode()
              }
            }}
          />
          <button type="button" onClick={addNode} disabled={!nodeLabel.trim()} className="px-4 py-2 bg-gray-700 text-white rounded-md text-sm hover:bg-gray-600 disabled:opacity-50">
            إضافة عقدة
          </button>
          <button type="button" onClick={deleteSelectedNodes} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">
            حذف المحدد
          </button>
        </div>
      )}

      <div className="h-full flex-1 flex min-h-0">
        <div className="flex-1 min-h-0">
          <ReactFlow
            nodes={computedNodes}
            edges={edges}
             onNodesChange={handleNodesChange}
             onEdgesChange={onEdgesChange}
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
          <div className="w-full lg:w-1/3 h-full overflow-y-auto p-4 bg-stone-800 border border-amber-700/40 rounded-lg">
            <h4 className="font-semibold text-amber-100">بطاقة البيانات للعقدة: {selectedNode?.data?.label}</h4>

            {isCreatePage && !readOnly && (
              <div className="mt-3">
                <label className="block text-sm text-amber-200 mb-1">اسم العقدة</label>
                <input
                  type="text"
                  className="w-full p-2 rounded border border-amber-700/40 bg-stone-900 text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
                  value={nodeTitle}
                  onChange={(e) => {
                    const v = e.target.value
                    setNodeTitle(v)
                    updateNodeLabel(v)
                  }}
                  placeholder="اسم العقدة..."
                />
              </div>
            )}
            {/* نص 1 قبل الرابط الأول */}
            {(() => {
              const firstTextIndex = flashcardFields.findIndex((f) => f.type === 'text')
              if (firstTextIndex < 0) return null
              const field = flashcardFields[firstTextIndex]
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-amber-300">نص 1</label>
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
                        حذف
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full mt-1 p-2 rounded border border-amber-700/40 bg-stone-900 text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
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
                    placeholder="نص..."
                  />
                </div>
              )
            })()}

            {/* الرابط الأول (الرابط الرئيسي للمقال) */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-amber-300">الرابط الأول</label>
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
                      + إنشاء وربط تلقائي
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
                        حذف
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!hideArticleLinkInputs && (
                <input
                  type="text"
                  className="w-full mt-1 p-2 rounded border border-amber-700/40 bg-stone-900 text-blue-400 placeholder-stone-400 caret-blue-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
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
                  placeholder="رابط داخلي: /articles/اسم-المقال • رابط خارجي: https://example.com"
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
                    // إنشاء وسم ودّي للرابط الرئيسي مماثل للروابط الإضافية: فضّل العنوان المُجلَب
                    let label: string
                    const isExternal = /^https?:\/\//i.test(articleLink)
                    if (!isExternal) {
                      const slug = normalizeSlugFromLink(articleLink)
                      const fallback = slug ? slug.replace(/-/g, ' ') : displayLink
                      label = (extraLinkTitles['main'] || '').trim() || fallback || 'عرض'
                    } else {
                      try {
                        const u = new URL(articleLink)
                        label = u.pathname && u.pathname !== '/' ? u.pathname.slice(1) : u.hostname
                      } catch {
                        label = displayLink || 'عرض'
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
                      تحرير
                    </button>
                  )}
                  {!isCreatePage && !readOnly && (selectedNode?.data as any)?.articleDraft && (
                    <button
                      onClick={() => openEditDraftArticleModal(selectedNode!.id, (selectedNode!.data as any).articleDraft)}
                      className="text-amber-400 hover:text-amber-300 underline text-xs"
                    >
                      تحرير المسودة
                    </button>
                  )}
                  {!isCreatePage && !readOnly && articleLink.startsWith('/articles/') && !(selectedNode?.data as any)?.articleDraft && (
                    <>
                      <a href={`${articleLink}/edit`} target="_blank" className="text-amber-400 hover:text-amber-300 underline text-xs">
                        تحرير مباشر
                      </a>
                      {collectDrafts && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const slug = normalizeSlugFromLink(articleLink)
                              if (!slug) {
                                toast.error('المعرّف النصي للمقال غير صالح')
                                return
                              }
                              const res = await fetch(`/api/articles/${slug}`)
                              if (!res.ok) {
                                toast.error('خطأ في جلب المقال')
                                return
                              }
                              const article = await res.json()
                              const draft = {
                                title: article.title || selectedNode!.data?.label || 'بدون عنوان',
                                description: article.description || '',
                                content: article.content || '',
                                slug,
                              }
                              setQuickArticleExistingDraft(draft)
                              setQuickArticleModalEditMode(true)
                              setModalTarget('main')
                            } catch (e) {
                              console.error(e)
                              toast.error('خطأ في تحضير التحرير المقترح')
                            }
                          }}
                          className="text-blue-300 hover:text-blue-200 underline text-xs"
                        >
                          تحرير مقترح
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
                      <label className="block text-xs text-amber-300">
                        {field.type === 'text'
                          ? `نص ${flashcardFields.slice(0, idx + 1).filter((f) => f.type === 'text').length}`
                          : (() => {
                              const linkOrder = flashcardFields
                                .slice(0, idx + 1)
                                .filter((f) => f.type === 'link').length
                              const base = (articleLink && articleLink.trim()) ? 1 : 0
                              const linkNumber = base + linkOrder
                              const ord = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر']
                              const ordLabel = ord[linkNumber - 1] || String(linkNumber)
                              return `الرابط ${ordLabel}`
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
                              + إنشاء وربط تلقائي
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
                            حذف
                          </button>
                        </div>
                      )}
                    </div>
                    {field.type === 'text' ? (
                      <textarea
                        className="w-full mt-1 p-2 rounded border border-amber-700/40 bg-stone-900 text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
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
                        placeholder="نص..."
                      />
                    ) : (
                      !hideArticleLinkInputs ? (
                        <input
                          type="text"
                          className="w-full mt-1 p-2 rounded border border-amber-700/40 bg-stone-900 text-blue-400 placeholder-stone-400 caret-blue-400 focus:outline-none focus:ring-2 focus:ring-amber-500/60 text-sm"
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
                          placeholder="رابط داخلي: /articles/اسم-المقال • رابط خارجي: https://example.com"
                        />
                      ) : null
                    )}
                    {field.type === 'link' && field.content ? (
                      (() => {
                        const isExternal = field.content.startsWith('http')
                        const href = isExternal
                          ? field.content
                          : `/articles/${normalizeSlugFromLink(field.content)}`

                        // احتساب وسم ودّي: فضّل عنوان المقال المُجلَب؛ وإلا فارجع إلى المعرّف/المسار
                        let label = 'عرض المقال'
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
                                تحرير
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
                  className="px-3 py-1 rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50 text-xs"
                >
                  + إضافة مربع نص
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...flashcardFields, { id: createFieldId(), type: 'link' as const, content: '' }]
                    setFlashcardFields(next)
                    updateFlashcardFields(next)
                  }}
                  className="px-3 py-1 rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50 text-xs"
                >
                  + إضافة مربع رابط
                </button>
              </div>
            )}

            {/* العُقَد المرتبطة (مرتبط بـ) — القسم السفلي من البطاقة التعليمية */}
            {(relatedNodeIds.length > 0 || !readOnly) && (
              <div className="mt-4 pt-3 border-t border-amber-700/40">
                <label className="block text-sm text-amber-200 mb-1">مرتبط بـ</label>
                <div className="flex flex-wrap gap-2">
                  {relatedNodeIds.length === 0 && (
                    <span className="text-xs text-amber-300/60">لم يتم اختيار أي عقدة</span>
                  )}
                  {relatedNodeIds.map((rid) => {
                    const rn = nodes.find((n) => n.id === rid)
                    const label = (rn?.data as any)?.label || `العقدة ${rid}`
                    return (
                      <span key={rid} className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedNodeId) return
                            focusNodesAndHighlight(selectedNodeId, rid)
                          }}
                          className="px-2 py-1 rounded border border-amber-700/40 bg-stone-900 text-amber-100 text-xs hover:bg-stone-800"
                          title={`تمييز الارتباط مع ${label}`}
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
                            aria-label="حذف العلاقة"
                            title="حذف"
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
                      className="px-2 py-1 rounded border border-amber-700/40 bg-stone-900 text-amber-100 text-xs min-w-[160px]"
                      value={relationToAddId}
                      onChange={(e) => setRelationToAddId(e.target.value)}
                    >
                      <option value="">اختر عقدة...</option>
                      {nodes
                        .filter((n) => n.id !== selectedNodeId && !relatedNodeIds.includes(n.id))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {(n.data as any)?.label || `العقدة ${n.id}`}
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
                      className="px-3 py-1 rounded border border-amber-700/40 text-amber-200 hover:bg-stone-700/50 text-xs disabled:opacity-50"
                    >
                      إضافة
                    </button>
                    {relatedNodeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRelatedNodeIds([])
                          updateRelatedNodes([])
                        }}
                        className="px-3 py-1 rounded border border-red-700/40 text-red-300 hover:bg-red-900/30 text-xs"
                      >
                        حذف الكل
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