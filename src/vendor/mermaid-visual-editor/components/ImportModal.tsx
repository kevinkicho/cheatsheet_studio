import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { parseMermaidFlowchart } from '../lib/parser'
import type { ParseResult } from '../lib/parser'
import { useFlowStore } from '../lib/store'

interface ImportModalProps {
  onClose: () => void
}

export function ImportModal({ onClose }: ImportModalProps) {
  const importDiagram = useFlowStore((s) => s.importDiagram)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Live parse feedback with 300ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      setResult(parseMermaidFlowchart(value))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleImport = useCallback(() => {
    if (!result || result.error) return
    const { nodes, edges, direction, look, curveStyle } = result
    importDiagram(nodes, edges, {
      direction,
      theme: 'dark',
      look,
      curveStyle,
    })
    onClose()
  }, [result, importDiagram, onClose])

  const canImport =
    result !== null && result.error === null && result.nodes.length > 0

  const statusText = () => {
    if (!value.trim()) return null
    if (!result) return <span className="text-zinc-500">Parsing…</span>
    if (result.error) return <span className="text-rose-400">{result.error}</span>
    return (
      <span className="text-emerald-400">
        {result.nodes.length} node{result.nodes.length !== 1 ? 's' : ''},&nbsp;
        {result.edges.length} edge{result.edges.length !== 1 ? 's' : ''}{' '}
        detected
      </span>
    )
  }

  // Portal to body so fixed layout uses the real viewport (not the scaled
  // Process toolbar transform / overflow:hidden card).
  const modal = (
    <div
      className="pointer-events-auto fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="mermaid-import-modal"
    >
      <div
        className="flex max-h-[min(85vh,640px)] w-full max-w-[580px] flex-col rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-labelledby="import-modal-title"
        aria-describedby="import-modal-desc"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2
              id="import-modal-title"
              className="text-sm font-semibold text-zinc-100"
            >
              Import Mermaid Syntax
            </h2>
            <p id="import-modal-desc" className="mt-0.5 text-xs text-zinc-500">
              Paste a flowchart definition to load it onto the canvas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[12rem] w-full flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 outline-none focus:border-transparent focus:ring-2 focus:ring-indigo-500"
            placeholder={`flowchart TD\n  A["Start"] --> B{"Decision?"}\n  B --> |"Yes"| C["Do it"]\n  B --> |"No"| D["Skip"]`}
            spellCheck={false}
            rows={14}
            aria-label="Mermaid Syntax"
          />
          <div className="min-h-[16px] shrink-0 text-xs" aria-live="polite">
            {statusText()}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 rounded-b-2xl border-t border-zinc-800 bg-zinc-950/60 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import to Canvas
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
