import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import {
  ArrowLeftRight,
  ArrowUpDown,
  GitBranch,
  Hand,
  Maximize2,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type {
  MermaidDiagramKind,
  MermaidFlowDirection,
  MermaidThemeId,
} from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import { MermaidView } from '@/components/math/MermaidView'
import { MermaidVisualEditor } from '@/components/tools/MermaidVisualEditor'
import {
  MERMAID_KINDS,
  MERMAID_THEMES,
  applyFlowDirection,
  detectFlowDirection,
  detectMermaidKind,
  mermaidTemplate,
} from '@/lib/mermaidTemplates'

/**
 * Right-sidebar tool: author Mermaid process charts with templates,
 * interactive options, live preview, and insert onto the canvas.
 */
export function CreateProcessChartPanel() {
  const addProcessChart = useCanvasStore((s) => s.addProcessChart)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const items = useCanvasStore((s) => s.items)

  const selectedChart = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const it = items.find((i) => i.id === selectedIds[0])
    return it?.type === 'process-chart' ? it : null
  }, [items, selectedIds])

  const [title, setTitle] = useState('Process chart')
  const [kind, setKind] = useState<MermaidDiagramKind>('flowchart')
  const [direction, setDirection] = useState<MermaidFlowDirection>('TD')
  // Default dark chrome — high contrast on zinc UI (not Mermaid “default” light)
  const [theme, setTheme] = useState<MermaidThemeId>('dark')
  const [source, setSource] = useState(() => mermaidTemplate('flowchart', 'TD'))
  const [status, setStatus] = useState<string | null>(null)
  const [quickNodes, setQuickNodes] = useState('Start, Step A, Decision, Done')
  /**
   * Flowchart: visual drag-drop (vendored mermaid-visual-editor) vs source text.
   * Other diagram kinds stay code-only (visual editor is flowchart-only).
   */
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual')
  /** Preview zoom (1 = natural SVG size). */
  const [previewZoom, setPreviewZoom] = useState(1)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  /** Drag-to-pan the preview viewport. */
  const [panMode, setPanMode] = useState(false)
  const previewViewportRef = useRef<HTMLDivElement>(null)
  /** When true, re-fit after the next successful Mermaid render. */
  const fitAfterRenderRef = useRef(false)
  const panDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)

  const PREVIEW_ZOOM_MIN = 0.15
  const PREVIEW_ZOOM_MAX = 4
  const PREVIEW_ZOOM_STEP = 0.15
  const PREVIEW_PAD = 20

  const clampPreviewZoom = (z: number) =>
    Math.min(
      PREVIEW_ZOOM_MAX,
      Math.max(PREVIEW_ZOOM_MIN, Math.round(z * 100) / 100),
    )

  /** Center scroll so the scaled diagram sits in the middle of the viewport. */
  const centerPreviewScroll = useCallback(() => {
    const vp = previewViewportRef.current
    if (!vp) return
    requestAnimationFrame(() => {
      const el = previewViewportRef.current
      if (!el) return
      const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
      const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollLeft = maxL / 2
      el.scrollTop = maxT / 2
    })
  }, [])

  /**
   * Zoom while keeping a focal content point under the same viewport pixel.
   * Default focus = viewport center (not diagram center).
   * `origin` is in scroll/content coordinates (scrollLeft + client offset).
   */
  const zoomPreview = useCallback(
    (nextZoom: number, origin?: { x: number; y: number }) => {
      const vp = previewViewportRef.current
      const z0 = previewZoom
      const z1 = clampPreviewZoom(nextZoom)
      if (z1 === z0) return

      const viewX = vp ? (origin ? origin.x - vp.scrollLeft : vp.clientWidth / 2) : 0
      const viewY = vp ? (origin ? origin.y - vp.scrollTop : vp.clientHeight / 2) : 0
      const focusX = origin?.x ?? (vp ? vp.scrollLeft + vp.clientWidth / 2 : 0)
      const focusY = origin?.y ?? (vp ? vp.scrollTop + vp.clientHeight / 2 : 0)
      const ratio = z1 / z0

      setPreviewZoom(z1)
      requestAnimationFrame(() => {
        const el = previewViewportRef.current
        if (!el) return
        el.scrollLeft = focusX * ratio - viewX
        el.scrollTop = focusY * ratio - viewY
        const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
        const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
        el.scrollLeft = Math.min(maxL, Math.max(0, el.scrollLeft))
        el.scrollTop = Math.min(maxT, Math.max(0, el.scrollTop))
      })
    },
    [previewZoom],
  )

  const fitPreviewContain = useCallback(
    (size?: { width: number; height: number }) => {
      const vp = previewViewportRef.current
      const w = size?.width ?? naturalSize.width
      const h = size?.height ?? naturalSize.height
      if (!vp || w < 2 || h < 2) return
      const sx = (Math.max(vp.clientWidth, 40) - PREVIEW_PAD) / w
      const sy = (Math.max(vp.clientHeight, 40) - PREVIEW_PAD) / h
      setPreviewZoom(clampPreviewZoom(Math.min(sx, sy)))
      centerPreviewScroll()
    },
    [naturalSize.height, naturalSize.width, centerPreviewScroll],
  )

  const fitPreviewWidth = useCallback(
    (size?: { width: number; height: number }) => {
      const vp = previewViewportRef.current
      const w = size?.width ?? naturalSize.width
      if (!vp || w < 2) return
      const sx = (Math.max(vp.clientWidth, 40) - PREVIEW_PAD) / w
      setPreviewZoom(clampPreviewZoom(sx))
      centerPreviewScroll()
    },
    [naturalSize.width, centerPreviewScroll],
  )

  const fitPreviewHeight = useCallback(
    (size?: { width: number; height: number }) => {
      const vp = previewViewportRef.current
      const h = size?.height ?? naturalSize.height
      if (!vp || h < 2) return
      const sy = (Math.max(vp.clientHeight, 40) - PREVIEW_PAD) / h
      setPreviewZoom(clampPreviewZoom(sy))
      centerPreviewScroll()
    },
    [naturalSize.height, centerPreviewScroll],
  )

  // Load editor from selected process-chart card
  useEffect(() => {
    if (!selectedChart) return
    setTitle(selectedChart.title || 'Process chart')
    setSource(selectedChart.mermaidSource || mermaidTemplate('flowchart', 'TD'))
    setTheme(selectedChart.mermaidTheme ?? 'dark')
    setKind(selectedChart.mermaidKind ?? detectMermaidKind(selectedChart.mermaidSource ?? ''))
    setDirection(
      selectedChart.mermaidDirection ??
        detectFlowDirection(selectedChart.mermaidSource ?? '') ??
        'TD',
    )
  }, [selectedChart?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- load on select change

  const applyTemplate = (k: MermaidDiagramKind) => {
    setKind(k)
    const dir = k === 'flowchart' ? direction : 'TD'
    setSource(mermaidTemplate(k, dir))
    // Visual canvas is flowchart-only (vendored mermaid-visual-editor)
    setEditorMode(k === 'flowchart' ? 'visual' : 'code')
    fitAfterRenderRef.current = true
    setStatus(`Loaded ${k} template`)
    window.setTimeout(() => setStatus(null), 1500)
  }

  const isFlowchartKind =
    kind === 'flowchart' || /^(flowchart|graph)\b/im.test(source.trim())

  const onDirectionChange = (d: MermaidFlowDirection) => {
    setDirection(d)
    if (kind === 'flowchart' || /^(flowchart|graph)\b/i.test(source.trim())) {
      setSource((prev) => applyFlowDirection(prev, d))
      fitAfterRenderRef.current = true
    }
  }

  const isPortrait = direction === 'TD' || direction === 'BT'
  const isLandscape = direction === 'LR' || direction === 'RL'

  /** Portrait (vertical flow) ↔ landscape (horizontal flow). */
  const setLayoutOrientation = (orient: 'portrait' | 'landscape') => {
    let next: MermaidFlowDirection
    if (orient === 'portrait') {
      // Keep reverse sense when possible: RL → BT, LR → TD
      next = direction === 'RL' || direction === 'BT' ? 'BT' : 'TD'
    } else {
      next = direction === 'BT' || direction === 'RL' ? 'RL' : 'LR'
    }
    onDirectionChange(next)
  }

  /**
   * Reverse flow on the current axis:
   * TD ↔ BT (vertical), LR ↔ RL (horizontal).
   */
  const reverseDirection = () => {
    const next: MermaidFlowDirection =
      direction === 'TD'
        ? 'BT'
        : direction === 'BT'
          ? 'TD'
          : direction === 'LR'
            ? 'RL'
            : 'LR'
    onDirectionChange(next)
  }

  const directionHint =
    direction === 'TD'
      ? 'Top → bottom'
      : direction === 'BT'
        ? 'Bottom → top'
        : direction === 'LR'
          ? 'Left → right'
          : 'Right → left'

  const buildFromNodeList = () => {
    const parts = quickNodes
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length < 2) {
      setStatus('Enter at least two node labels (comma-separated)')
      return
    }
    const ids = parts.map((_, i) => `N${i + 1}`)
    const lines = [`flowchart ${direction}`]
    parts.forEach((label, i) => {
      const safe = label.replace(/[[\]()]/g, '')
      const shape =
        i === 0 || i === parts.length - 1
          ? `${ids[i]}([${safe}])`
          : `${ids[i]}[${safe}]`
      lines.push(`    ${shape}`)
    })
    for (let i = 0; i < ids.length - 1; i++) {
      lines.push(`    ${ids[i]} --> ${ids[i + 1]}`)
    }
    setKind('flowchart')
    setSource(lines.join('\n'))
    fitAfterRenderRef.current = true
    setStatus('Built flowchart from node list')
    window.setTimeout(() => setStatus(null), 1500)
  }

  const insert = () => {
    const src = source.trim()
    if (!src) {
      setStatus('Diagram source is empty')
      return
    }
    addProcessChart(src, {
      title: title.trim() || 'Process chart',
      mermaidTheme: theme,
      mermaidKind: kind,
      mermaidDirection: direction,
    })
    setStatus('Added to canvas')
    window.setTimeout(() => setStatus(null), 1600)
  }

  const updateSelected = () => {
    if (!selectedChart) return
    const src = source.trim()
    if (!src) {
      setStatus('Diagram source is empty')
      return
    }
    updateItem(selectedChart.id, {
      title: title.trim() || 'Process chart',
      mermaidSource: src,
      mermaidTheme: theme,
      mermaidKind: kind,
      mermaidDirection: direction,
    })
    setStatus('Updated selected chart')
    window.setTimeout(() => setStatus(null), 1600)
  }

  const onRendered = useCallback(
    (size: { width: number; height: number }) => {
      setNaturalSize(size)
      if (fitAfterRenderRef.current) {
        fitAfterRenderRef.current = false
        requestAnimationFrame(() => fitPreviewContain(size))
      }
      // Do not re-center on ordinary re-renders — preserves pan/zoom focus
    },
    [fitPreviewContain],
  )

  // Fit once on first successful render; templates re-enable via fitAfterRenderRef
  useEffect(() => {
    fitAfterRenderRef.current = true
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="process-chart-panel">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 px-2.5 py-1.5">
        <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
          Process chart
        </span>
        <span className="ml-auto text-[9px] text-zinc-600">Mermaid</span>
      </div>

      <PanelGroup direction="vertical" autoSaveId="process-chart-panel-v" className="min-h-0 flex-1">
        {/* Config + editor */}
        <Panel defaultSize={58} minSize={30}>
          <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
            <div className="space-y-2 border-b border-zinc-800 px-2.5 py-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[9px] font-medium uppercase text-zinc-500">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field-input py-1 text-[11px]"
                />
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-medium uppercase text-zinc-500">
                    Diagram type
                  </span>
                  <select
                    value={kind}
                    onChange={(e) => {
                      const k = e.target.value as MermaidDiagramKind
                      applyTemplate(k)
                    }}
                    className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
                    data-testid="mermaid-kind"
                  >
                    {MERMAID_KINDS.map((k) => (
                      <option key={k.id} value={k.id} title={k.description}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-medium uppercase text-zinc-500">
                    Theme
                  </span>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as MermaidThemeId)}
                    className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-indigo-500/50"
                    data-testid="mermaid-theme"
                  >
                    {MERMAID_THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(kind === 'flowchart' ||
                /^(flowchart|graph)\b/i.test(source.trim())) && (
                <div
                  className="flex items-center gap-1.5"
                  data-testid="mermaid-orientation"
                >
                  <div
                    className="inline-flex flex-1 rounded-md border border-zinc-800/80 bg-zinc-950/50 p-0.5"
                    role="group"
                    aria-label="Portrait or landscape"
                  >
                    <button
                      type="button"
                      title="Portrait — vertical flow"
                      onClick={() => setLayoutOrientation('portrait')}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] transition ${
                        isPortrait
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <RectangleVertical className="h-3 w-3 opacity-80" />
                      <span className="hidden sm:inline">Portrait</span>
                    </button>
                    <button
                      type="button"
                      title="Landscape — horizontal flow"
                      onClick={() => setLayoutOrientation('landscape')}
                      className={`inline-flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] transition ${
                        isLandscape
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <RectangleHorizontal className="h-3 w-3 opacity-80" />
                      <span className="hidden sm:inline">Landscape</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    title={`Reverse direction (${directionHint})`}
                    onClick={reverseDirection}
                    data-testid="mermaid-reverse-direction"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-800/80 px-2 py-1 text-[10px] text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-200"
                  >
                    {isPortrait ? (
                      <ArrowUpDown className="h-3 w-3" />
                    ) : (
                      <ArrowLeftRight className="h-3 w-3" />
                    )}
                    <span>Reverse</span>
                  </button>
                </div>
              )}

              <div>
                <p className="mb-1 text-[9px] font-medium uppercase text-zinc-500">
                  Templates
                </p>
                <div className="flex flex-wrap gap-1">
                  {MERMAID_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      title={k.description}
                      onClick={() => applyTemplate(k.id)}
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-medium transition ${
                        kind === k.id
                          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                          : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-1.5">
                <p className="mb-1 flex items-center gap-1 text-[9px] font-medium uppercase text-zinc-500">
                  <Sparkles className="h-3 w-3" />
                  Quick flowchart from list
                </p>
                <input
                  value={quickNodes}
                  onChange={(e) => setQuickNodes(e.target.value)}
                  placeholder="Start, Step A, Decision, Done"
                  className="field-input mb-1 py-1 text-[10px]"
                />
                <button
                  type="button"
                  onClick={buildFromNodeList}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-900"
                >
                  <RefreshCw className="h-3 w-3" />
                  Build linear flowchart
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-0.5 p-2.5 pt-2">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-medium uppercase text-zinc-500">
                  {isFlowchartKind && editorMode === 'visual'
                    ? 'Visual editor'
                    : 'Mermaid source'}
                </span>
                {isFlowchartKind && (
                  <div
                    className="ml-auto inline-flex rounded border border-zinc-800 p-0.5"
                    role="group"
                    aria-label="Editor mode"
                  >
                    <button
                      type="button"
                      onClick={() => setEditorMode('visual')}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                        editorMode === 'visual'
                          ? 'bg-indigo-500/20 text-indigo-100'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      data-testid="mermaid-mode-visual"
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('code')}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                        editorMode === 'code'
                          ? 'bg-indigo-500/20 text-indigo-100'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      data-testid="mermaid-mode-code"
                    >
                      Code
                    </button>
                  </div>
                )}
              </div>

              {isFlowchartKind && editorMode === 'visual' ? (
                <div className="min-h-[12rem] flex-1">
                  <MermaidVisualEditor
                    source={source}
                    onSourceChange={(mmd) => {
                      setSource(mmd)
                      setKind('flowchart')
                      const d = detectFlowDirection(mmd)
                      if (d) setDirection(d)
                    }}
                  />
                </div>
              ) : (
                <textarea
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    const d = detectFlowDirection(e.target.value)
                    if (d) setDirection(d)
                    setKind(detectMermaidKind(e.target.value))
                  }}
                  spellCheck={false}
                  className="field-input min-h-[8rem] flex-1 resize-y font-mono text-[10px] leading-relaxed"
                  data-testid="mermaid-source"
                />
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle
          className="group relative h-1.5 shrink-0 bg-zinc-900 transition hover:bg-indigo-500/50 data-[resize-handle-active]:bg-indigo-500/60"
          title="Drag to resize preview"
        />

        {/* Preview */}
        <Panel defaultSize={42} minSize={18} maxSize={70}>
          <div
            className="flex h-full min-h-0 flex-col border-t border-zinc-800 bg-[#12141a]"
            data-testid="mermaid-preview-chrome"
            data-studio-theme="dark"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800 px-2 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Preview
              </span>
              <div
                className="ml-auto flex flex-wrap items-center gap-0.5"
                role="group"
                aria-label="Preview zoom and pan"
              >
                <button
                  type="button"
                  title="Pan — drag to move the diagram"
                  data-testid="mermaid-preview-pan"
                  onClick={() => setPanMode((p) => !p)}
                  className={`rounded border p-1 transition ${
                    panMode
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <Hand className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Zoom out (viewport center)"
                  data-testid="mermaid-preview-zoom-out"
                  onClick={() =>
                    zoomPreview(previewZoom - PREVIEW_ZOOM_STEP)
                  }
                  className="rounded border border-zinc-800 p-1 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Reset to 100% (keeps view focus)"
                  onClick={() => zoomPreview(1)}
                  className="min-w-[2.75rem] rounded border border-zinc-800 px-1 py-0.5 text-[10px] tabular-nums text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <button
                  type="button"
                  title="Zoom in (viewport center)"
                  data-testid="mermaid-preview-zoom-in"
                  onClick={() =>
                    zoomPreview(previewZoom + PREVIEW_ZOOM_STEP)
                  }
                  className="rounded border border-zinc-800 p-1 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Fit entire diagram (contain, centered)"
                  data-testid="mermaid-preview-fit"
                  onClick={() => fitPreviewContain()}
                  className="inline-flex items-center gap-0.5 rounded border border-zinc-800 px-1.5 py-1 text-[10px] font-medium text-zinc-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                >
                  <Maximize2 className="h-3 w-3" />
                  Fit
                </button>
                <button
                  type="button"
                  title="Zoom to fit width (centered)"
                  data-testid="mermaid-preview-fit-width"
                  onClick={() => fitPreviewWidth()}
                  className="inline-flex items-center gap-0.5 rounded border border-zinc-800 px-1.5 py-1 text-[10px] font-medium text-zinc-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  W
                </button>
                <button
                  type="button"
                  title="Zoom to fit height (centered)"
                  data-testid="mermaid-preview-fit-height"
                  onClick={() => fitPreviewHeight()}
                  className="inline-flex items-center gap-0.5 rounded border border-zinc-800 px-1.5 py-1 text-[10px] font-medium text-zinc-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100"
                >
                  <ArrowUpDown className="h-3 w-3" />
                  H
                </button>
              </div>
            </div>
            <div
              ref={previewViewportRef}
              className={`min-h-0 flex-1 overflow-auto p-2 ${
                panMode ? 'cursor-grab active:cursor-grabbing select-none' : ''
              }`}
              data-testid="mermaid-preview-viewport"
              onWheel={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return
                e.preventDefault()
                const vp = previewViewportRef.current
                if (!vp) return
                const rect = vp.getBoundingClientRect()
                // Focal point in content (scroll) coordinates
                const contentX = vp.scrollLeft + (e.clientX - rect.left)
                const contentY = vp.scrollTop + (e.clientY - rect.top)
                const delta =
                  e.deltaY > 0 ? -PREVIEW_ZOOM_STEP : PREVIEW_ZOOM_STEP
                zoomPreview(previewZoom + delta, {
                  x: contentX,
                  y: contentY,
                })
              }}
              onPointerDown={(e) => {
                if (!panMode || e.button !== 0) return
                const vp = previewViewportRef.current
                if (!vp) return
                e.preventDefault()
                try {
                  vp.setPointerCapture(e.pointerId)
                } catch {
                  /* ignore */
                }
                panDragRef.current = {
                  pointerId: e.pointerId,
                  startX: e.clientX,
                  startY: e.clientY,
                  scrollLeft: vp.scrollLeft,
                  scrollTop: vp.scrollTop,
                }
              }}
              onPointerMove={(e) => {
                const d = panDragRef.current
                const vp = previewViewportRef.current
                if (!d || !vp || d.pointerId !== e.pointerId) return
                vp.scrollLeft = d.scrollLeft - (e.clientX - d.startX)
                vp.scrollTop = d.scrollTop - (e.clientY - d.startY)
              }}
              onPointerUp={(e) => {
                const d = panDragRef.current
                if (!d || d.pointerId !== e.pointerId) return
                panDragRef.current = null
                const vp = previewViewportRef.current
                if (vp) {
                  try {
                    vp.releasePointerCapture(e.pointerId)
                  } catch {
                    /* ignore */
                  }
                }
              }}
              onPointerCancel={() => {
                panDragRef.current = null
              }}
            >
              {/* min-full flex center: diagram stays centered when smaller than the pane */}
              <div className="flex min-h-full min-w-full items-center justify-center">
                <MermaidView
                  source={source}
                  theme={theme}
                  forceDark={theme !== 'forest'}
                  scale={previewZoom}
                  onRendered={onRendered}
                  className="min-h-[4rem]"
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 border-t border-zinc-800 px-2.5 py-2">
              {status && (
                <p className="text-center text-[10px] text-emerald-300/90">
                  {status}
                </p>
              )}
              <div className="flex gap-1.5">
                {selectedChart && (
                  <button
                    type="button"
                    onClick={updateSelected}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
                    data-testid="mermaid-update-selected"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Update card
                  </button>
                )}
                <button
                  type="button"
                  onClick={insert}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-500 px-2 py-2 text-xs font-medium text-white hover:bg-indigo-400"
                  data-testid="mermaid-add-to-canvas"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add to canvas
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
