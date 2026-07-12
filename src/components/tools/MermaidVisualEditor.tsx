/**
 * Embedded flowchart visual editor adapted from
 * https://github.com/saketkattu/mermaid-visual-editor (MIT).
 * Canvas is source of truth; Mermaid syntax is serialized out.
 */
import { useEffect, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Canvas } from '@/vendor/mermaid-visual-editor/components/Canvas'
import { TopToolbar } from '@/vendor/mermaid-visual-editor/components/TopToolbar'
import { ZoomControls } from '@/vendor/mermaid-visual-editor/components/ZoomControls'
import { useFlowStore } from '@/vendor/mermaid-visual-editor/lib/store'
import { serialize } from '@/vendor/mermaid-visual-editor/lib/serializer'
import { parseMermaidFlowchart } from '@/vendor/mermaid-visual-editor/lib/parser'

type Props = {
  /** Current Mermaid source (used when loading into canvas). */
  source: string
  /** Called whenever canvas serializes to new Mermaid. */
  onSourceChange: (mermaid: string) => void
  className?: string
}

function VisualEditorInner({ source, onSourceChange }: Props) {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const direction = useFlowStore((s) => s.direction)
  const theme = useFlowStore((s) => s.theme)
  const look = useFlowStore((s) => s.look)
  const curveStyle = useFlowStore((s) => s.curveStyle)
  const importDiagram = useFlowStore((s) => s.importDiagram)
  const setTheme = useFlowStore((s) => s.setTheme)

  const syntax = serialize(nodes, edges, {
    direction,
    theme,
    look,
    curveStyle,
  })

  // Prefer studio dark theme for our app chrome
  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  // Push serialized Mermaid upstream (skip identical to avoid loops)
  const lastEmitted = useRef('')
  useEffect(() => {
    if (syntax === lastEmitted.current) return
    lastEmitted.current = syntax
    onSourceChange(syntax)
  }, [syntax, onSourceChange])

  // Load external source into canvas when it diverges (template switch / paste)
  const lastLoaded = useRef('')
  useEffect(() => {
    const trimmed = source.trim()
    if (!trimmed || trimmed === lastLoaded.current) return
    if (trimmed === lastEmitted.current) {
      lastLoaded.current = trimmed
      return
    }
    // Only import flowchart/graph into visual canvas
    if (!/^(flowchart|graph)\b/im.test(trimmed.replace(/^---[\s\S]*?---\s*/m, ''))) {
      return
    }
    const result = parseMermaidFlowchart(trimmed)
    if (result.error || result.nodes.length === 0) return
    importDiagram(result.nodes, result.edges, {
      direction: result.direction,
      theme: result.theme === 'default' ? 'dark' : result.theme,
      look: result.look,
      curveStyle: result.curveStyle,
    })
    lastLoaded.current = trimmed
    lastEmitted.current = serialize(result.nodes, result.edges, {
      direction: result.direction,
      theme: 'dark',
      look: result.look,
      curveStyle: result.curveStyle,
    })
  }, [source, importDiagram])

  return (
    <div
      className="mermaid-visual-editor relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-zinc-800 bg-[#e0e5ec]"
      data-testid="mermaid-visual-editor"
    >
      <div className="relative min-h-0 flex-1">
        <Canvas />
        <div className="pointer-events-none absolute left-0 right-0 top-2 z-20 flex justify-center">
          <div className="pointer-events-auto scale-90 origin-top">
            <TopToolbar
              inspectorOpen={false}
              onToggleInspector={() => {}}
              syntax={syntax}
            />
          </div>
        </div>
        <ZoomControls />
      </div>
      <p className="shrink-0 border-t border-zinc-300/60 bg-[#e0e5ec] px-2 py-1 text-[9px] text-zinc-600">
        Visual flowchart editor (MIT · saketkattu/mermaid-visual-editor). Drag
        nodes, connect handles. Mermaid source updates automatically.
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
