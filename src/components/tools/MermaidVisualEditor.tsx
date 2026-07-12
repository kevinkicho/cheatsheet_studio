/**
 * Embedded flowchart visual editor adapted from
 * https://github.com/saketkattu/mermaid-visual-editor (MIT).
 * Canvas is source of truth; Mermaid syntax is serialized out.
 */
import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Canvas } from '@/vendor/mermaid-visual-editor/components/Canvas'
import { TopToolbar } from '@/vendor/mermaid-visual-editor/components/TopToolbar'
import { ZoomControls } from '@/vendor/mermaid-visual-editor/components/ZoomControls'
import { InspectorPanel } from '@/vendor/mermaid-visual-editor/components/Inspector/InspectorPanel'
import { useFlowStore } from '@/vendor/mermaid-visual-editor/lib/store'
import { serialize } from '@/vendor/mermaid-visual-editor/lib/serializer'
import { parseMermaidFlowchart } from '@/vendor/mermaid-visual-editor/lib/parser'

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
  className?: string
}

/** Snapshot current visual canvas as Mermaid (for Add/Update card). */
export function getVisualEditorMermaidSource(): string {
  const { nodes, edges, direction, theme, look, curveStyle } =
    useFlowStore.getState()
  if (nodes.length === 0) return ''
  return serialize(nodes, edges, { direction, theme, look, curveStyle })
}

function stripFrontmatter(src: string): string {
  const t = src.trim()
  if (!/^---\s*\r?\n/.test(t)) return t
  const end = t.indexOf('\n---', 3)
  if (end === -1) return t
  return t.slice(end + 4).trim()
}

function tryImportFlowchart(
  raw: string,
  importDiagram: ReturnType<typeof useFlowStore.getState>['importDiagram'],
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const body = stripFrontmatter(trimmed)
  if (!/^(flowchart|graph)\b/im.test(body)) return null
  const result = parseMermaidFlowchart(trimmed)
  if (result.error || result.nodes.length === 0) return null
  importDiagram(result.nodes, result.edges, {
    direction: result.direction,
    theme: 'dark',
    look: result.look,
    curveStyle: result.curveStyle,
  })
  return serialize(result.nodes, result.edges, {
    direction: result.direction,
    theme: 'dark',
    look: result.look,
    curveStyle: result.curveStyle,
  })
}

function VisualEditorInner({
  source,
  onSourceChange,
  reloadToken = 0,
  className,
}: Props) {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const direction = useFlowStore((s) => s.direction)
  const theme = useFlowStore((s) => s.theme)
  const look = useFlowStore((s) => s.look)
  const curveStyle = useFlowStore((s) => s.curveStyle)
  const importDiagram = useFlowStore((s) => s.importDiagram)
  const setTheme = useFlowStore((s) => s.setTheme)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const syntax = serialize(nodes, edges, {
    direction,
    theme,
    look,
    curveStyle,
  })

  const bootstrapped = useRef(false)
  const lastEmitted = useRef('')
  const lastLoaded = useRef('')
  const lastReload = useRef(reloadToken)

  // Prefer studio dark theme for our app chrome
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  // Bootstrap canvas once from parent source (template / selected card).
  useEffect(() => {
    if (bootstrapped.current) return
    const out = tryImportFlowchart(source, importDiagram)
    if (out) {
      lastLoaded.current = source.trim()
      lastEmitted.current = out
      onSourceChange(out)
    }
    bootstrapped.current = true
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push canvas → parent whenever user edits (never emit placeholder-only)
  useEffect(() => {
    if (!bootstrapped.current) return
    if (nodes.length === 0) return
    if (syntax === lastEmitted.current) return
    lastEmitted.current = syntax
    lastLoaded.current = syntax
    onSourceChange(syntax)
  }, [syntax, nodes.length, onSourceChange])

  // Parent source changed externally OR reloadToken bumped (templates)
  useEffect(() => {
    if (!bootstrapped.current) return
    const tokenBump = reloadToken !== lastReload.current
    lastReload.current = reloadToken

    const trimmed = source.trim()
    if (!trimmed) return
    if (!tokenBump && trimmed === lastLoaded.current) return
    if (!tokenBump && trimmed === lastEmitted.current) {
      lastLoaded.current = trimmed
      return
    }

    const out = tryImportFlowchart(trimmed, importDiagram)
    if (!out) return
    lastLoaded.current = trimmed
    lastEmitted.current = out
    if (tokenBump) onSourceChange(out)
  }, [source, reloadToken, importDiagram, onSourceChange])

  return (
    <div
      className={`mermaid-visual-editor relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-zinc-700/80 ${className ?? ''}`}
      data-testid="mermaid-visual-editor"
    >
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <Canvas />
          <div className="pointer-events-none absolute left-0 right-0 top-2 z-20 flex justify-center">
            <div className="pointer-events-auto origin-top scale-90">
              <TopToolbar
                inspectorOpen={inspectorOpen}
                onToggleInspector={() => setInspectorOpen((o) => !o)}
                syntax={syntax}
              />
            </div>
          </div>
          <ZoomControls />
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
        Select (V) · Pan (H) · scroll to zoom · middle-drag pans in select mode
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
