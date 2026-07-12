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
import {
  applyMindmapTreeLayout,
  parseMermaidMindmap,
  serializeMindmap,
} from '@/vendor/mermaid-visual-editor/lib/mindmap'

type Props = {
  /** Current Mermaid source (used when loading into canvas). */
  source: string
  /** Called whenever canvas serializes to new Mermaid. */
  onSourceChange: (mermaid: string) => void
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
 * Flowcharts are laid out by rendering Mermaid (same engine as sheet cards)
 * and copying node positions — so free-form RF matches Add to canvas.
 */
async function tryImport(
  raw: string,
  importDiagram: ImportFn,
  preferredKind?: DiagramKind,
): Promise<string | null> {
  const trimmed = raw.trim()
  const body = stripFrontmatter(trimmed || '')

  // Chip wins over source sniffing (fixes sticky mindmap after clicking Flowchart)
  const kind: DiagramKind =
    preferredKind === 'mindmap' || preferredKind === 'flowchart'
      ? preferredKind
      : detectKindFromSource(body || 'flowchart TD')

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
  // Exact Mermaid engine positions, sizes, and edge paths (same as sheet cards)
  const laid = await layoutWithMermaid(
    syntaxOut,
    result.nodes,
    result.edges,
  )
  importDiagram(laid.nodes, laid.edges, {
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
  // Ignore canvas→parent pushes until import for this kind has settled
  const suppressPush = useRef(false)

  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  // Bootstrap (or remount via key={kind} on parent)
  useEffect(() => {
    if (bootstrapped.current) return
    suppressPush.current = true
    let cancelled = false
    void tryImport(source, importDiagram, diagramKindProp).then((out) => {
      if (cancelled) return
      if (out) {
        lastLoaded.current = out.trim()
        lastEmitted.current = out
        onSourceChange(out)
      }
      lastKindProp.current = diagramKindProp
      bootstrapped.current = true
      queueMicrotask(() => {
        suppressPush.current = false
      })
    })
    return () => {
      cancelled = true
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

  // Parent source / reloadToken / diagram kind chip changed
  useEffect(() => {
    if (!bootstrapped.current) return

    const tokenBump = reloadToken !== lastReload.current
    lastReload.current = reloadToken

    const kindChanged =
      diagramKindProp !== undefined &&
      diagramKindProp !== lastKindProp.current
    lastKindProp.current = diagramKindProp

    const trimmed = source.trim()
    if (!trimmed && !kindChanged) return

    if (
      !tokenBump &&
      !kindChanged &&
      (trimmed === lastLoaded.current || trimmed === lastEmitted.current)
    ) {
      lastLoaded.current = trimmed
      return
    }

    // Kind chip or template reload — preferredKind is always the chip
    suppressPush.current = true
    let cancelled = false
    void tryImport(
      trimmed ||
        (diagramKindProp === 'mindmap' ? EMPTY_MINDMAP : EMPTY_FLOWCHART),
      importDiagram,
      diagramKindProp,
    ).then((out) => {
      if (cancelled) return
      if (out) {
        lastLoaded.current = out.trim()
        lastEmitted.current = out
        onSourceChange(out)
      }
      queueMicrotask(() => {
        suppressPush.current = false
      })
    })
    return () => {
      cancelled = true
    }
  }, [source, reloadToken, importDiagram, onSourceChange, diagramKindProp])

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
          ? 'Mind map · Tab=child · Enter=sibling · Shift+Tab=promote · Inspector for shape/color/icon/reparent'
          : 'Select (V) · Pan (H) · scroll to zoom · Auto Layout matches sheet spacing'}
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
