/**
 * Embedded interactive diagram editor adapted from
 * https://github.com/saketkattu/mermaid-visual-editor (MIT).
 * Canvas is source of truth; Mermaid syntax is serialized out.
 * Supports flowchart + mindmap (never a static Mermaid preview).
 */
import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Canvas } from '@/vendor/mermaid-visual-editor/components/Canvas'
import { TopToolbar } from '@/vendor/mermaid-visual-editor/components/TopToolbar'
import { ZoomControls } from '@/vendor/mermaid-visual-editor/components/ZoomControls'
import { InspectorPanel } from '@/vendor/mermaid-visual-editor/components/Inspector/InspectorPanel'
import {
  useFlowStore,
  type DiagramKind,
} from '@/vendor/mermaid-visual-editor/lib/store'
import { serialize } from '@/vendor/mermaid-visual-editor/lib/serializer'
import { parseMermaidFlowchart } from '@/vendor/mermaid-visual-editor/lib/parser'
import { layoutWithMermaid } from '@/vendor/mermaid-visual-editor/lib/layoutFromMermaid'
import { cleanFlowchartLayout } from '@/vendor/mermaid-visual-editor/lib/layout'
import {
  applyMindmapTreeLayout,
  parseMermaidMindmap,
  serializeMindmap,
} from '@/vendor/mermaid-visual-editor/lib/mindmap'
import {
  captureProcessFlow,
  isProcessFlowSnapshot,
  processFlowToRf,
} from '@/lib/processFlowSnapshot'
import type { ProcessFlowSnapshot } from '@/lib/processFlowSnapshot'

type Props = {
  /** Current Mermaid source (used when loading into canvas). */
  source: string
  /** Called whenever canvas serializes to new Mermaid. */
  onSourceChange: (mermaid: string) => void
  /**
   * Free-form snapshot from a selected canvas card. When set (with reload),
   * loads exact positions/paths into the editor instead of re-laying Mermaid.
   */
  processFlow?: ProcessFlowSnapshot | null
  /**
   * Debounced editor → card sync: mermaid text + free-form snapshot.
   * Parent should write both onto the selected process-chart item.
   */
  onEditorSnapshot?: (
    mermaid: string,
    processFlow: ProcessFlowSnapshot | null,
  ) => void
  /**
   * Increment to force re-import of `source` (template apply / direction).
   * Parent should bump when the same string is re-applied.
   */
  reloadToken?: number
  /**
   * Authoritative diagram mode from Process panel chips.
   * Always wins over source sniffing when provided.
   */
  diagramKind?: DiagramKind
  /**
   * Reset diagram to the default starter template (parent clears source +
   * bumps reloadToken). Confirmed in the toolbar before calling.
   */
  onReset?: () => void
  className?: string
}

const EMPTY_FLOWCHART = `flowchart TD
  %% Add nodes to get started`

const EMPTY_MINDMAP = `mindmap
  root((Topic))
`

function stripFrontmatter(src: string): string {
  const t = src.trim()
  if (!/^---\s*\r?\n/.test(t)) return t
  const end = t.indexOf('\n---', 3)
  if (end === -1) return t
  return t.slice(end + 4).trim()
}

function detectKindFromSource(raw: string): DiagramKind {
  const body = stripFrontmatter(raw)
  if (/^mindmap\b/im.test(body)) return 'mindmap'
  return 'flowchart'
}

function serializeCanvas(): string {
  const { nodes, edges, direction, theme, look, curveStyle, diagramKind } =
    useFlowStore.getState()
  if (nodes.length === 0) return ''
  if (diagramKind === 'mindmap') {
    return serializeMindmap(nodes, edges)
  }
  return serialize(nodes, edges, { direction, theme, look, curveStyle })
}

/** Snapshot current visual canvas as Mermaid (for Add/Update card). */
export function getVisualEditorMermaidSource(): string {
  return serializeCanvas()
}

/**
 * Free-form graph snapshot for sheet cards / print — matches what the
 * interactive editor shows (positions + edge routing), not a Mermaid re-layout.
 */
export function getVisualEditorProcessFlow(): ProcessFlowSnapshot | null {
  const { nodes, edges, direction, curveStyle, multiEdgeSpacing, diagramKind } =
    useFlowStore.getState()
  if (nodes.length === 0) return null
  // Mind maps use the same free-form snapshot path as flowcharts so the card
  // paints the RF editor geometry (not a Mermaid re-layout).
  return captureProcessFlow(nodes, edges, {
    direction,
    curveStyle,
    multiEdgeSpacing,
    diagramKind:
      diagramKind === 'mindmap' || diagramKind === 'flowchart'
        ? diagramKind
        : 'flowchart',
  })
}

type ImportFn = ReturnType<typeof useFlowStore.getState>['importDiagram']

function resetCanvas(importDiagram: ImportFn, kind: DiagramKind) {
  importDiagram([], [], {
    direction: 'TD',
    theme: 'dark',
    look: 'classic',
    curveStyle: 'basis',
    diagramKind: kind,
  })
}

/**
 * Load source into the RF store.
 * Prefer `processFlow` snapshot (card truth) when present; else Mermaid layout.
 */
async function tryImport(
  raw: string,
  importDiagram: ImportFn,
  preferredKind?: DiagramKind,
  processFlow?: ProcessFlowSnapshot | null,
): Promise<string | null> {
  const trimmed = raw.trim()
  const body = stripFrontmatter(trimmed || '')

  // Chip wins over source sniffing (fixes sticky mindmap after clicking Flowchart)
  const kind: DiagramKind =
    preferredKind === 'mindmap' || preferredKind === 'flowchart'
      ? preferredKind
      : detectKindFromSource(body || 'flowchart TD')

  // Card free-form snapshot → editor (exact match, no Mermaid re-layout).
  // Flowchart + mindmap both use processFlow as geometry truth.
  if (
    (kind === 'flowchart' || kind === 'mindmap') &&
    isProcessFlowSnapshot(processFlow) &&
    processFlow.nodes.length > 0
  ) {
    // Prefer Process chip kind so mindmap edges restore as straight spokes
    // even if an older snapshot omitted diagramKind.
    const snapForRf =
      kind === 'mindmap' && processFlow.diagramKind !== 'mindmap'
        ? { ...processFlow, diagramKind: 'mindmap' as const }
        : processFlow
    const { nodes, edges } = processFlowToRf(snapForRf)
    importDiagram(nodes, edges, {
      direction: processFlow.direction ?? 'TD',
      theme: 'dark',
      look: 'classic',
      curveStyle: processFlow.curveStyle ?? 'basis',
      diagramKind: kind,
      // Keep snapshot handles/paths exactly as saved on the card
      skipHandleReconcile: true,
    })
    if (typeof processFlow.multiEdgeSpacing === 'number') {
      useFlowStore.setState({ multiEdgeSpacing: processFlow.multiEdgeSpacing })
    }
    useFlowStore.setState((s) => ({ layoutEpoch: s.layoutEpoch + 1 }))
    if (kind === 'mindmap') {
      const syntaxOut =
        trimmed && /^mindmap\b/im.test(body)
          ? trimmed
          : serializeMindmap(nodes, edges)
      return syntaxOut
    }
    const syntaxOut =
      trimmed && /^(flowchart|graph)\b/im.test(body)
        ? trimmed
        : serialize(nodes, edges, {
            direction: processFlow.direction ?? 'TD',
            theme: 'dark',
            look: 'classic',
            curveStyle: processFlow.curveStyle ?? 'basis',
          })
    return syntaxOut
  }

  if (kind === 'mindmap') {
    const src = /^mindmap\b/im.test(body) ? trimmed : EMPTY_MINDMAP
    const result = parseMermaidMindmap(src)
    if (result.error || result.nodes.length === 0) {
      resetCanvas(importDiagram, 'mindmap')
      return EMPTY_MINDMAP
    }
    const laidOut = applyMindmapTreeLayout(result.nodes, result.edges, 'TD')
    importDiagram(laidOut, result.edges, {
      direction: 'TD',
      theme: 'dark',
      look: 'classic',
      curveStyle: 'basis',
      diagramKind: 'mindmap',
    })
    useFlowStore.setState((s) => ({ layoutEpoch: s.layoutEpoch + 1 }))
    return serializeMindmap(laidOut, result.edges)
  }

  // ── flowchart only (never fall through from mindmap body) ───────────────
  const flowSrc = /^(flowchart|graph)\b/im.test(body)
    ? trimmed
    : EMPTY_FLOWCHART
  const result = parseMermaidFlowchart(flowSrc)
  if (result.error || result.nodes.length === 0) {
    // Still clear any leftover mindmap nodes
    resetCanvas(importDiagram, 'flowchart')
    if (result.nodes.length === 0 && !result.error) {
      // empty starter is ok
      return EMPTY_FLOWCHART
    }
    // parser failed on real content — show empty flowchart, not old mindmap
    return EMPTY_FLOWCHART
  }

  const syntaxOut = serialize(result.nodes, result.edges, {
    direction: result.direction,
    theme: 'dark',
    look: result.look,
    curveStyle: result.curveStyle,
  })
  // Mermaid for sizes when available, then dagre for a clean ranked stack so
  // smooth-step edges look like a normal flowchart (not staggered diagonals).
  const laid = await layoutWithMermaid(
    syntaxOut,
    result.nodes,
    result.edges,
  )
  const cleaned = cleanFlowchartLayout(
    laid.nodes,
    laid.edges,
    result.direction,
  )
  importDiagram(cleaned.nodes, cleaned.edges, {
    direction: result.direction,
    theme: 'dark',
    look: result.look,
    curveStyle: result.curveStyle,
    diagramKind: 'flowchart',
  })
  useFlowStore.setState((s) => ({
    layoutEpoch: s.layoutEpoch + 1,
  }))
  return syntaxOut
}

/** Positions top tools + zoom bars; orientation from flow store chromeLayout. */
function ChromeOverlay({
  inspectorOpen,
  onToggleInspector,
  syntax,
  onReset,
}: {
  inspectorOpen: boolean
  onToggleInspector: () => void
  syntax: string
  onReset?: () => void
}) {
  const chromeLayout = useFlowStore((s) => s.chromeLayout)
  const vertical = chromeLayout === 'vertical'

  return (
    <>
      {vertical ? (
        <div className="pointer-events-none absolute bottom-0 left-2 top-0 z-20 flex items-center">
          <div className="pointer-events-auto origin-left scale-90">
            <TopToolbar
              inspectorOpen={inspectorOpen}
              onToggleInspector={onToggleInspector}
              syntax={syntax}
              onReset={onReset}
            />
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-0 right-0 top-2 z-20 flex justify-center">
          <div className="pointer-events-auto origin-top scale-90">
            <TopToolbar
              inspectorOpen={inspectorOpen}
              onToggleInspector={onToggleInspector}
              syntax={syntax}
              onReset={onReset}
            />
          </div>
        </div>
      )}
      {/* Zoom bar self-positions: bottom-center or right-center */}
      <ZoomControls />
    </>
  )
}

function VisualEditorInner({
  source,
  onSourceChange,
  processFlow = null,
  onEditorSnapshot,
  reloadToken = 0,
  diagramKind: diagramKindProp,
  onReset,
  className,
}: Props) {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const direction = useFlowStore((s) => s.direction)
  const theme = useFlowStore((s) => s.theme)
  const look = useFlowStore((s) => s.look)
  const curveStyle = useFlowStore((s) => s.curveStyle)
  const multiEdgeSpacing = useFlowStore((s) => s.multiEdgeSpacing)
  const diagramKind = useFlowStore((s) => s.diagramKind)
  const importDiagram = useFlowStore((s) => s.importDiagram)
  const setTheme = useFlowStore((s) => s.setTheme)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const syntax =
    diagramKind === 'mindmap'
      ? serializeMindmap(nodes, edges)
      : serialize(nodes, edges, { direction, theme, look, curveStyle })

  const bootstrapped = useRef(false)
  const lastEmitted = useRef('')
  const lastLoaded = useRef('')
  const lastReload = useRef(reloadToken)
  const lastKindProp = useRef<DiagramKind | undefined>(diagramKindProp)
  const lastPfKey = useRef('')
  // Ignore canvas→parent pushes until import for this kind has settled
  const suppressPush = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processFlowRef = useRef(processFlow)
  processFlowRef.current = processFlow

  const pfKey = (() => {
    if (!isProcessFlowSnapshot(processFlow) || processFlow.nodes.length === 0) {
      return ''
    }
    // Fingerprint geometry so re-select with same Mermaid text still restores
    const paths = processFlow.edges.map((e) => e.path?.length ?? 0).join('.')
    return `${processFlow.nodes.length}:${processFlow.edges.length}:${processFlow.width}x${processFlow.height}:${paths}`
  })()

  const beginSuppressPush = (ms = 600) => {
    suppressPush.current = true
    if (suppressTimer.current) clearTimeout(suppressTimer.current)
    suppressTimer.current = setTimeout(() => {
      suppressPush.current = false
      suppressTimer.current = null
    }, ms)
  }

  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  // Bootstrap (or remount via key={kind} on parent)
  useEffect(() => {
    if (bootstrapped.current) return
    beginSuppressPush(800)
    let cancelled = false
    void tryImport(
      source,
      importDiagram,
      diagramKindProp,
      processFlowRef.current,
    ).then((out) => {
      if (cancelled) return
      if (out) {
        lastLoaded.current = out.trim()
        lastEmitted.current = out
        onSourceChange(out)
      }
      lastKindProp.current = diagramKindProp
      lastPfKey.current = pfKey
      bootstrapped.current = true
      beginSuppressPush(600)
    })
    return () => {
      cancelled = true
      if (suppressTimer.current) clearTimeout(suppressTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push canvas → parent whenever user edits (not during kind switch import)
  useEffect(() => {
    if (!bootstrapped.current || suppressPush.current) return
    if (nodes.length === 0) return
    if (syntax === lastEmitted.current) return
    lastEmitted.current = syntax
    lastLoaded.current = syntax
    onSourceChange(syntax)
  }, [syntax, nodes.length, onSourceChange])

  // Debounced free-form snapshot → parent (card must match live editor paint)
  useEffect(() => {
    if (!bootstrapped.current || suppressPush.current) return
    if (!onEditorSnapshot) return
    if (nodes.length === 0) return
    // Short delay so FlowEdge can publish live paths before capture
    const t = window.setTimeout(() => {
      if (suppressPush.current) return
      const mermaid = serializeCanvas()
      const flow = getVisualEditorProcessFlow()
      // Never push null flow — that would wipe processFlow on the card
      if (!flow) return
      onEditorSnapshot(mermaid, flow)
    }, 120)
    return () => window.clearTimeout(t)
  }, [nodes, edges, direction, curveStyle, multiEdgeSpacing, onEditorSnapshot])

  // Parent source / reloadToken / diagram kind chip / processFlow changed
  useEffect(() => {
    if (!bootstrapped.current) return

    const tokenBump = reloadToken !== lastReload.current
    lastReload.current = reloadToken

    const kindChanged =
      diagramKindProp !== undefined &&
      diagramKindProp !== lastKindProp.current
    lastKindProp.current = diagramKindProp

    const pfChanged = pfKey !== lastPfKey.current

    const trimmed = source.trim()
    if (!trimmed && !kindChanged && !tokenBump && !pfChanged) return

    // Same Mermaid text alone must not skip restore when processFlow geometry changed
    if (
      !tokenBump &&
      !kindChanged &&
      !pfChanged &&
      (trimmed === lastLoaded.current || trimmed === lastEmitted.current)
    ) {
      lastLoaded.current = trimmed
      return
    }

    // Kind chip, template reload, or card selection — prefer processFlow when set
    beginSuppressPush(800)
    lastPfKey.current = pfKey
    let cancelled = false
    void tryImport(
      trimmed ||
        (diagramKindProp === 'mindmap' ? EMPTY_MINDMAP : EMPTY_FLOWCHART),
      importDiagram,
      diagramKindProp,
      processFlowRef.current,
    ).then((out) => {
      if (cancelled) return
      if (out) {
        lastLoaded.current = out.trim()
        lastEmitted.current = out
        onSourceChange(out)
      }
      beginSuppressPush(600)
    })
    return () => {
      cancelled = true
      // Import may have scheduled suppress timers — clear on cancel/unmount
      if (suppressTimer.current) {
        clearTimeout(suppressTimer.current)
        suppressTimer.current = null
      }
    }
  }, [
    source,
    reloadToken,
    importDiagram,
    onSourceChange,
    diagramKindProp,
    pfKey,
  ])

  // Unmount: drop suppress timer (store is global; panel flush reads it first)
  useEffect(() => {
    return () => {
      if (suppressTimer.current) {
        clearTimeout(suppressTimer.current)
        suppressTimer.current = null
      }
    }
  }, [])

  return (
    <div
      className={`mermaid-visual-editor relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-zinc-700/80 ${className ?? ''}`}
      data-testid="mermaid-visual-editor"
      data-diagram-kind={diagramKind}
    >
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <Canvas />
          {/* Floating chrome: horizontal = top+bottom center; vertical = left+right center */}
          <ChromeOverlay
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((o) => !o)}
            syntax={syntax}
            onReset={onReset}
          />
        </div>
        {inspectorOpen && (
          <InspectorPanel
            syntax={syntax}
            onCollapse={() => setInspectorOpen(false)}
          />
        )}
      </div>
      <p
        className="shrink-0 border-t px-2 py-1 text-[9px]"
        style={{
          borderColor: 'var(--neu-border, #3f3f46)',
          background: 'var(--neu-bg, #12141a)',
          color: 'var(--neu-text-muted, #a1a1aa)',
        }}
      >
        {diagramKind === 'mindmap'
          ? 'Mind map · straight spokes · Auto Layout = radial tree · Tab=child · Enter=sibling · Shift+Tab=promote'
          : 'Select (V) · Pan (H or Shift+drag) · scroll to zoom · drop a link on empty → new rectangle'}
      </p>
    </div>
  )
}

export function MermaidVisualEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <VisualEditorInner {...props} />
    </ReactFlowProvider>
  )
}
