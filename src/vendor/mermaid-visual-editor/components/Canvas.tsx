import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { fitViewPaddingForChrome } from '../lib/chromeLayout'
import { useFlowStore, type FlowEdgeData, type FlowNodeData } from '../lib/store'
import { FlowNode } from './NodeTypes/FlowNode'
import { MindmapNode } from './NodeTypes/MindmapNode'
import { FlowEdge } from './EdgeTypes/FlowEdge'
import { MindmapEdge } from './EdgeTypes/MindmapEdge'
import { MermaidConnectionLine } from './EdgeTypes/MermaidConnectionLine'

const nodeTypes = { flowNode: FlowNode, mindmapNode: MindmapNode }
const edgeTypes = { flowEdge: FlowEdge, mindmapEdge: MindmapEdge }

interface CanvasInnerProps {
  onOpenPalette?: () => void
}

function CanvasInner({ onOpenPalette }: CanvasInnerProps) {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect, onReconnect, removeEdgeById,
    addNode, addNodeAtPosition,
    addConnectedNodeAtPosition,
    undo, redo, duplicateSelected, copySelected, pasteClipboard,
    pushHistory, assignToSubgraph,
    drawingShape, setDrawingShape,
    interactionMode, setInteractionMode,
    diagramKind,
    layoutEpoch,
    addMindmapChild,
    addMindmapSibling,
    promoteMindmapNodes,
    selectedWaypoint,
    removeEdgeWaypoint,
    setSelectedWaypoint,
  } = useFlowStore()
  const { screenToFlowPosition, fitView, getViewport, setViewport } =
    useReactFlow()
  const panMode = !drawingShape && interactionMode === 'pan'
  const isMindmap = diagramKind === 'mindmap'
  const chartShowGrid = useFlowStore((s) => s.chartShowGrid)
  const chartGridColor = useFlowStore((s) => s.chartGridColor)

  // Track failed edge re-plug so we can delete the connection
  const edgeReconnectOk = useRef(true)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // After Auto Layout / Layout tree / mindmap import / add shape — fit whole diagram
  const lastLayoutEpoch = useRef(-1)
  const lastFocusToken = useRef(0)
  const chromeLayout = useFlowStore((s) => s.chromeLayout)
  const focusNodeRequest = useFlowStore((s) => s.focusNodeRequest)

  /**
   * Framing: keep the RF surface hidden (solid panel bg) until zoom-fit has
   * settled. No opacity fade / no animated camera — reveal only the final view.
   */
  const [surfaceReady, setSurfaceReady] = useState(nodes.length === 0)
  const surfaceReadyRef = useRef(nodes.length === 0)
  /** Ignore panel-resize viewport shifts until framing is done + size stable. */
  const allowResizeCorrectRef = useRef(false)
  const frameGenRef = useRef(0)
  const diagramKindRef = useRef(diagramKind)

  const fitOpts = useCallback(
    () => ({
      padding: fitViewPaddingForChrome(chromeLayout),
      duration: 0 as const,
      minZoom: 0.05,
      maxZoom: 2.5,
    }),
    [chromeLayout],
  )

  /** Instant fit (no animation). User Fit button in ZoomControls still animates. */
  const runFitView = useCallback(
    (duration = 0) => {
      void fitView({
        padding: fitViewPaddingForChrome(chromeLayout),
        duration,
        minZoom: 0.05,
        maxZoom: 2.5,
      })
    },
    [fitView, chromeLayout],
  )

  const revealSurface = useCallback((gen: number) => {
    if (gen !== frameGenRef.current) return
    surfaceReadyRef.current = true
    setSurfaceReady(true)
    // Enable resize correction only after a short stable window (panel open animation)
    window.setTimeout(() => {
      if (gen === frameGenRef.current) {
        allowResizeCorrectRef.current = true
      }
    }, 200)
  }, [])

  /**
   * Multi-pass instant fit while hidden, then reveal once.
   * Pass 1: after RF measures; pass 2: after another frame (label/size settle).
   */
  const frameContent = useCallback(
    (opts?: { hide?: boolean }) => {
      const hide = opts?.hide !== false
      if (hide) {
        frameGenRef.current += 1
        surfaceReadyRef.current = false
        setSurfaceReady(false)
        allowResizeCorrectRef.current = false
      }
      const gen = frameGenRef.current
      let cancelled = false
      let attempts = 0

      const wrapperSized = () => {
        const el = wrapperRef.current
        return Boolean(el && el.clientWidth > 16 && el.clientHeight > 16)
      }

      const nodesSized = () => {
        // Prefer live RF store nodes (include measured dims after layout)
        const list = useFlowStore.getState().nodes
        if (list.length === 0) return true
        let withSize = 0
        for (const n of list) {
          const mw = n.measured?.width
          const mh = n.measured?.height
          const sw =
            typeof n.width === 'number'
              ? n.width
              : typeof n.style?.width === 'number'
                ? n.style.width
                : 0
          const sh =
            typeof n.height === 'number'
              ? n.height
              : typeof n.style?.height === 'number'
                ? n.style.height
                : 0
          const w = mw && mw > 1 ? mw : sw
          const h = mh && mh > 1 ? mh : sh
          if (w > 1 && h > 1) withSize += 1
        }
        // Most nodes have dims (subgraphs may lag)
        return withSize >= Math.min(list.length, Math.max(1, list.length - 1))
      }

      const tick = () => {
        if (cancelled || gen !== frameGenRef.current) return
        attempts += 1
        const readyEnv = wrapperSized() && nodesSized()
        if (!readyEnv && attempts < 40) {
          // ~16ms * 40 ≈ 640ms max wait for measure
          window.requestAnimationFrame(tick)
          return
        }
        // Pass 1
        void Promise.resolve(fitView(fitOpts())).finally(() => {
          if (cancelled || gen !== frameGenRef.current) return
          // Pass 2 after layout paint
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (cancelled || gen !== frameGenRef.current) return
              void Promise.resolve(fitView(fitOpts())).finally(() => {
                if (cancelled || gen !== frameGenRef.current) return
                // One more micro-settle for edge labels / fonts
                window.setTimeout(() => {
                  if (cancelled || gen !== frameGenRef.current) return
                  void Promise.resolve(fitView(fitOpts())).finally(() => {
                    if (cancelled || gen !== frameGenRef.current) return
                    revealSurface(gen)
                  })
                }, 32)
              })
            })
          })
        })
      }

      // Start after current commit so RF has mounted nodes
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(tick)
      })

      return () => {
        cancelled = true
      }
    },
    [fitView, fitOpts, revealSurface],
  )

  // Auto layout / import epoch — reframe; hide only if surface not yet shown
  useEffect(() => {
    if (layoutEpoch === lastLayoutEpoch.current) return
    lastLayoutEpoch.current = layoutEpoch
    if (nodes.length === 0) {
      revealSurface(frameGenRef.current)
      return
    }
    return frameContent({ hide: !surfaceReadyRef.current })
  }, [layoutEpoch, frameContent, nodes.length, revealSurface])

  // Diagram kind change (flowchart ↔ mindmap) or first mount with content
  useEffect(() => {
    const kindChanged = diagramKindRef.current !== diagramKind
    diagramKindRef.current = diagramKind
    if (nodes.length === 0) {
      revealSurface(frameGenRef.current)
      return
    }
    lastLayoutEpoch.current = layoutEpoch
    // Always hide+frame on kind switch; on first mount hide if not ready
    return frameContent({ hide: kindChanged || !surfaceReadyRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kind / mount only
  }, [diagramKind, isMindmap])

  // Empty → first nodes (late import) while editor already open
  const hadNodes = useRef(nodes.length > 0)
  useEffect(() => {
    if (nodes.length === 0) {
      hadNodes.current = false
      revealSurface(frameGenRef.current)
      return
    }
    if (hadNodes.current) return
    hadNodes.current = true
    if (surfaceReadyRef.current) {
      // Content appeared after empty — reframe without flash if already visible
      return frameContent({ hide: true })
    }
    return frameContent({ hide: true })
  }, [nodes.length, frameContent, revealSurface])

  // Newly added shape / group — silent reframe (surface already visible)
  useEffect(() => {
    if (!focusNodeRequest) return
    if (focusNodeRequest.token === lastFocusToken.current) return
    lastFocusToken.current = focusNodeRequest.token
    return frameContent({ hide: false })
  }, [focusNodeRequest, frameContent])

  // Safety: never leave surface hidden forever
  useEffect(() => {
    if (surfaceReady) return
    const t = window.setTimeout(() => {
      runFitView(0)
      revealSurface(frameGenRef.current)
    }, 700)
    return () => window.clearTimeout(t)
  }, [surfaceReady, runFitView, revealSurface, nodes.length, diagramKind])

  const handleReconnectStart = useCallback(() => {
    edgeReconnectOk.current = false
  }, [])

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectOk.current = true
      onReconnect(oldEdge as Edge<FlowEdgeData>, newConnection)
    },
    [onReconnect],
  )

  const handleReconnectEnd = useCallback(
    (_event: unknown, edge: Edge) => {
      if (!edgeReconnectOk.current) {
        removeEdgeById(edge.id)
      }
      edgeReconnectOk.current = true
    },
    [removeEdgeById],
  )

  /**
   * Drop connection preview on empty canvas → place a rectangle and wire it.
   * Valid drops onto existing nodes still use onConnect only.
   */
  const handleConnectEnd = useCallback(
    (
      event: globalThis.MouseEvent | globalThis.TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (drawingShape || panMode) return
      // Successful connect is handled by onConnect
      if (connectionState.isValid) return
      const fromNode = connectionState.fromNode
      if (!fromNode) return

      // Only create when released on the pane (not on a node/handle/UI chrome)
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.react-flow__node')) return
      if (target.closest('.react-flow__handle')) return
      if (target.closest('[data-shape-picker]')) return
      // Prefer pane / viewport; also allow wrapper if RF marks differently
      const onPane =
        target.classList.contains('react-flow__pane') ||
        !!target.closest('.react-flow__pane') ||
        target.classList.contains('react-flow__viewport') ||
        !!target.closest('.react-flow__viewport')
      if (!onPane) return

      const { clientX, clientY } =
        'changedTouches' in event
          ? {
              clientX: event.changedTouches[0]?.clientX ?? 0,
              clientY: event.changedTouches[0]?.clientY ?? 0,
            }
          : { clientX: event.clientX, clientY: event.clientY }

      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
      const fromHandle = connectionState.fromHandle
      addConnectedNodeAtPosition({
        position: flowPos,
        fromNodeId: fromNode.id,
        fromHandleId: fromHandle?.id ?? null,
        fromHandleType: fromHandle?.type ?? 'source',
        // Mindmap drop-on-empty defaults to circle topics
        shape: isMindmap ? 'circle' : 'rectangle',
      })
    },
    [
      isMindmap,
      drawingShape,
      panMode,
      screenToFlowPosition,
      addConnectedNodeAtPosition,
    ],
  )

  /**
   * Flowchart: pipe edges + reconnect. Mindmap: straight radial spokes.
   */
  const wiredEdges = useMemo(() => {
    if (isMindmap) {
      return edges.map((e) => ({
        ...e,
        type: 'mindmapEdge' as const,
        reconnectable: false,
        // Force center handles so RF always has endpoints for mindmap spokes
        sourceHandle: 'center',
        targetHandle: 'center-target',
        // Keep under node fills (nodes layer stacks above edges)
        zIndex: 0,
        style: {
          ...(e.style ?? {}),
          stroke: (e.data as FlowEdgeData | undefined)?.strokeColor || '#a1a1aa',
        },
      }))
    }
    return edges.map((e) => ({
      ...e,
      type: 'flowEdge' as const,
      reconnectable: true,
      // Below node bodies; elevateEdgesOnSelect lifts when editing plugs
      zIndex: e.selected ? 1000 : 0,
    }))
  }, [edges, isMindmap])

  // ── Draw-mode state ─────────────────────────────────────────────────────────
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

  /**
   * Keep diagram center fixed when the Process panel (right rail) resizes.
   * Disabled during initial framing so open-animation resizes don’t drift the camera.
   */
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    let prevW = el.clientWidth
    let prevH = el.clientHeight
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (prevW < 8 || prevH < 8) {
        prevW = w
        prevH = h
        return
      }
      const dw = w - prevW
      const dh = h - prevH
      prevW = w
      prevH = h
      if (Math.abs(dw) < 0.5 && Math.abs(dh) < 0.5) return
      // Skip while hidden or before size stabilizes after open
      if (!surfaceReadyRef.current || !allowResizeCorrectRef.current) return
      // Shift viewport so the world point under the previous center stays centered
      const vp = getViewport()
      setViewport(
        {
          x: vp.x + dw / 2,
          y: vp.y + dh / 2,
          zoom: vp.zoom,
        },
        { duration: 0 },
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [getViewport, setViewport])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // Escape → cancel draw mode → back to select
      if (e.key === 'Escape') {
        setDrawingShape(null)
        setInteractionMode('select')
        setDragStart(null)
        setDragCurrent(null)
        return
      }

      // H → pan (hand), V → select (when not typing)
      if (!isTyping && (e.key === 'h' || e.key === 'H')) {
        setInteractionMode('pan')
        return
      }
      if (!isTyping && (e.key === 'v' || e.key === 'V')) {
        setInteractionMode('select')
        return
      }

      // Mind map: Tab = child, Enter = sibling, Shift+Tab = promote
      if (!isTyping && isMindmap) {
        if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault()
          promoteMindmapNodes()
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          addMindmapChild()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          addMindmapSibling()
          return
        }
      }

      // Delete selected connection bend point
      if (
        !isTyping &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedWaypoint
      ) {
        e.preventDefault()
        removeEdgeWaypoint(
          selectedWaypoint.edgeId,
          selectedWaypoint.waypointId,
        )
        setSelectedWaypoint(null)
        return
      }

      // N → add node (when not typing)
      if (!isTyping && (e.key === 'n' || e.key === 'N')) {
        if (isMindmap) addMindmapChild()
        else addNode()
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

      // Ctrl+Z → undo
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl+Shift+Z or Ctrl+Y → redo
      if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+D → duplicate selected
      if (ctrl && e.key === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }

      // Ctrl+C → copy selected
      if (ctrl && !e.shiftKey && e.key === 'c') {
        e.preventDefault()
        copySelected()
        return
      }

      // Ctrl+V → paste clipboard
      if (ctrl && !e.shiftKey && e.key === 'v') {
        e.preventDefault()
        pasteClipboard()
        return
      }

      // Ctrl+K / Meta+K → open command palette
      if (ctrl && e.key === 'k') {
        e.preventDefault()
        onOpenPalette?.()
        return
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    addNode,
    undo,
    redo,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    setDrawingShape,
    setInteractionMode,
    onOpenPalette,
    isMindmap,
    addMindmapChild,
    addMindmapSibling,
    promoteMindmapNodes,
    selectedWaypoint,
    removeEdgeWaypoint,
    setSelectedWaypoint,
  ])

  // ── Double-click on blank canvas → add node at cursor ─────────────────────
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (drawingShape) return
    const target = e.target as Element
    if (target.closest('.react-flow__node')) return
    if (target.closest('.react-flow__edge')) return
    if (target.closest('.react-flow__controls')) return
    if (target.closest('.react-flow__minimap')) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNodeAtPosition(position)
  }

  // ── Draw-mode mouse handlers ────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!drawingShape) return
      const target = e.target as Element
      if (target.closest('.react-flow__node')) return
      if (target.closest('.react-flow__controls')) return
      if (target.closest('.react-flow__minimap')) return
      e.preventDefault()
      setDragStart({ x: e.clientX, y: e.clientY })
      setDragCurrent({ x: e.clientX, y: e.clientY })
    },
    [drawingShape],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStart) return
      setDragCurrent({ x: e.clientX, y: e.clientY })
    },
    [dragStart],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStart || !drawingShape) return
      const end = { x: e.clientX, y: e.clientY }

      const dx = Math.abs(end.x - dragStart.x)
      const dy = Math.abs(end.y - dragStart.y)

      const flowStart = screenToFlowPosition({ x: dragStart.x, y: dragStart.y })
      const flowEnd = screenToFlowPosition({ x: end.x, y: end.y })

      if (dx < 20 && dy < 20) {
        // Single click — create default-sized node
        addNodeAtPosition(flowStart, drawingShape)
      } else {
        const x = Math.min(flowStart.x, flowEnd.x)
        const y = Math.min(flowStart.y, flowEnd.y)
        const w = Math.abs(flowEnd.x - flowStart.x)
        const h = Math.abs(flowEnd.y - flowStart.y)
        addNodeAtPosition({ x, y }, drawingShape, w, h)
      }

      setDragStart(null)
      setDragCurrent(null)
      setDrawingShape(null)
    },
    [dragStart, drawingShape, screenToFlowPosition, addNodeAtPosition, setDrawingShape],
  )

  // ── Push history after drag ends; auto-assign/unassign group membership ─────
  const handleNodeDragStop = useCallback(
    // xyflow passes MouseEvent | TouchEvent; keep handler permissive
    (_event: unknown, draggedNode: Node<FlowNodeData>) => {
      pushHistory()
      const allNodes = useFlowStore.getState().nodes

      // Group dragged onto free nodes — auto-assign nodes now inside it
      if (draggedNode.data.isSubgraph) {
        const sgW = typeof draggedNode.style?.width === 'number' ? draggedNode.style.width : 320
        const sgH = typeof draggedNode.style?.height === 'number' ? draggedNode.style.height : 220
        const freeNodes = allNodes.filter((n) => !n.data.isSubgraph && !n.parentId)
        const toAssign = freeNodes.filter((n) => {
          const nw = n.measured?.width ?? 150
          const nh = n.measured?.height ?? 60
          const cx = n.position.x + nw / 2
          const cy = n.position.y + nh / 2
          return (
            cx >= draggedNode.position.x && cx <= draggedNode.position.x + sgW &&
            cy >= draggedNode.position.y && cy <= draggedNode.position.y + sgH
          )
        })
        if (toAssign.length > 0) assignToSubgraph(toAssign.map((n) => n.id), draggedNode.id)
        return
      }

      const w = draggedNode.measured?.width ?? 150
      const h = draggedNode.measured?.height ?? 60

      // Node already in a group — check if it was dragged outside
      if (draggedNode.parentId) {
        const parent = allNodes.find((n) => n.id === draggedNode.parentId)
        if (parent) {
          const sgW = typeof parent.style?.width === 'number' ? parent.style.width : 320
          const sgH = typeof parent.style?.height === 'number' ? parent.style.height : 220
          const cx = draggedNode.position.x + w / 2
          const cy = draggedNode.position.y + h / 2
          if (cx < 0 || cx > sgW || cy < 0 || cy > sgH) {
            assignToSubgraph([draggedNode.id], null)
          }
        }
        return
      }

      // Free node — check if dropped inside a group
      const subgraphs = allNodes.filter((n) => n.data.isSubgraph)
      if (subgraphs.length === 0) return
      const cx = draggedNode.position.x + w / 2
      const cy = draggedNode.position.y + h / 2
      for (const sg of subgraphs) {
        const sgW = typeof sg.style?.width === 'number' ? sg.style.width : 320
        const sgH = typeof sg.style?.height === 'number' ? sg.style.height : 220
        if (cx >= sg.position.x && cx <= sg.position.x + sgW &&
            cy >= sg.position.y && cy <= sg.position.y + sgH) {
          assignToSubgraph([draggedNode.id], sg.id)
          return
        }
      }
    },
    [pushHistory, assignToSubgraph]
  )

  const previewRect =
    dragStart && dragCurrent
      ? {
          left: Math.min(dragStart.x, dragCurrent.x),
          top: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragCurrent.x - dragStart.x),
          height: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null

  // Offset preview rect relative to wrapper element
  // eslint-disable-next-line react-hooks/refs
  const wrapperRect = wrapperRef.current?.getBoundingClientRect()
  const relativePreview = previewRect && wrapperRect
    ? {
        left: previewRect.left - wrapperRect.left,
        top: previewRect.top - wrapperRect.top,
        width: previewRect.width,
        height: previewRect.height,
      }
    : null

  return (
    <div
      ref={wrapperRef}
      className={`w-full h-full relative ${
        drawingShape ? 'cursor-crosshair' : panMode ? 'cursor-grab' : ''
      }`}
      style={{
        // Solid hold color while RF frames off-screen (no wrong-geometry flash)
        background: 'var(--neu-bg, #12141a)',
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div
        className="absolute inset-0"
        style={{
          // Hard hide until multi-pass fit settles — no opacity fade artifact
          visibility: surfaceReady ? 'visible' : 'hidden',
          pointerEvents: surfaceReady ? 'auto' : 'none',
        }}
        aria-hidden={!surfaceReady}
      >
      <ReactFlow
        nodes={nodes}
        edges={wiredEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={handleConnectEnd}
        onReconnect={isMindmap ? undefined : handleReconnect}
        onReconnectStart={isMindmap ? undefined : handleReconnectStart}
        onReconnectEnd={isMindmap ? undefined : handleReconnectEnd}
        edgesReconnectable={!isMindmap && !drawingShape && !panMode}
        // RF shifts grips by this amount along the edge. Keep ~0 so centers
        // sit on the true endpoints; CSS sets equal visual r on both ends.
        reconnectRadius={1}
        defaultEdgeOptions={{
          type: isMindmap ? 'mindmapEdge' : 'flowEdge',
          reconnectable: !isMindmap,
          interactionWidth: 20,
          // Under node fills; selected edges elevate for grips
          zIndex: 0,
        }}
        // Flowchart rubber band; mindmap uses RF default (straight)
        connectionLineComponent={isMindmap ? undefined : MermaidConnectionLine}
        elevateEdgesOnSelect
        onNodeDragStop={handleNodeDragStop}
        // Controlled fit via frameContent — avoid always-on fitView (jump/twitch)
        minZoom={0.05}
        maxZoom={2.5}
        deleteKeyCode={['Backspace', 'Delete']}
        // Loose: radial ports work as both source/target; mindmap uses center handles
        connectionMode={ConnectionMode.Loose}
        // Snap to the port the user aimed at (not a distant face)
        connectionRadius={28}
        // Draw: no pan. Pan mode: left-drag pans. Select: middle/right pan only.
        // Hold Shift + left-drag to pan (must null selectionKeyCode — RF defaults
        // selectionKeyCode to Shift which forces selection and blocks pan).
        panOnDrag={drawingShape ? false : panMode ? true : [1, 2]}
        panActivationKeyCode={drawingShape || panMode ? null : 'Shift'}
        selectionKeyCode={null}
        selectionOnDrag={!drawingShape && !panMode}
        // Ctrl/Cmd multi-select (Shift reserved for temporary pan)
        multiSelectionKeyCode={['Control', 'Meta']}
        nodesDraggable={!drawingShape && !panMode}
        elementsSelectable={!drawingShape}
        edgesFocusable={!drawingShape}
        panOnScroll
        zoomOnScroll
        style={{ background: 'transparent' }}
      >
        {chartShowGrid && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={chartGridColor || 'var(--neu-dot, #2a2d36)'}
          />
        )}
        {/* SVG filter for hand-drawn look on nodes (class rf-hand-drawn) */}
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
          <defs>
            <filter
              id="rf-hand-drawn-filter"
              x="-8%"
              y="-8%"
              width="116%"
              height="116%"
            >
              <feTurbulence
                type="turbulence"
                baseFrequency="0.035"
                numOctaves="2"
                seed="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="2.8"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      </ReactFlow>
      </div>

      {relativePreview && relativePreview.width > 4 && relativePreview.height > 4 && (
        <div
          className="absolute pointer-events-none rounded border-2 border-dashed border-indigo-400/70 bg-indigo-500/10"
          style={relativePreview}
        />
      )}

      {nodes.length === 0 && !drawingShape && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="max-w-[16rem] text-center"
            style={{ color: 'var(--neu-text-muted, #a1a1aa)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--neu-text, #e4e4e7)' }}>
              Canvas is empty
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              {isMindmap
                ? 'Load the Mind map template, or press N / Tab to add a topic. Enter = sibling.'
                : (
                  <>
                    Pick a template above, draw a shape, double-click, or press{' '}
                    <kbd
                      className="rounded px-1 py-0.5 font-mono text-[10px]"
                      style={{
                        background: 'var(--neu-kbd-bg, #27272a)',
                        color: 'var(--neu-text-muted, #a1a1aa)',
                      }}
                    >
                      N
                    </kbd>{' '}
                    to add a node.
                  </>
                )}
            </p>
          </div>
        </div>
      )}

      {/* Draw-mode hint: bottom-center of canvas (not clipped by left chrome) */}
      {drawingShape && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3"
        >
          <div
            style={{
              background: '#4F46E5',
              color: 'white',
              fontSize: 11,
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 50,
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              boxShadow: '0 4px 16px rgba(79,70,229,0.45)',
            }}
          >
            Drawing: {drawingShape} — drag on canvas — Esc to cancel
          </div>
        </div>
      )}
    </div>
  )
}

export function Canvas({ onOpenPalette }: { onOpenPalette?: () => void }) {
  return <CanvasInner onOpenPalette={onOpenPalette} />
}
