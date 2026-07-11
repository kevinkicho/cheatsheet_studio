import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCanvasStore } from '@/stores/canvasStore'
import { LatexView } from '@/components/math/LatexView'

export function CreateEquationPanel() {
  const addCustomEquation = useCanvasStore((s) => s.addCustomEquation)
  const [latex, setLatex] = useState('E = mc^2')
  const [title, setTitle] = useState('Custom equation')

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-zinc-500">
        Write LaTeX and add it to the canvas. Preview updates live via KaTeX.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase text-zinc-500">
          Title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="field-input"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase text-zinc-500">
          LaTeX
        </span>
        <textarea
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          rows={5}
          className="field-input font-mono text-[11px]"
          spellCheck={false}
          placeholder="e.g. \int_a^b f(x)\,dx"
        />
      </label>
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
        <p className="mb-1 text-[10px] uppercase text-zinc-500">Preview</p>
        <LatexView latex={latex} className="text-sm text-zinc-100" />
      </div>
      <button
        type="button"
        onClick={() => {
          if (!latex.trim()) return
          addCustomEquation(latex.trim(), title.trim() || 'Custom equation')
        }}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400"
      >
        <Plus className="h-3.5 w-3.5" />
        Add to canvas
      </button>
    </div>
  )
}
