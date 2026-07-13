import { lazy, Suspense } from 'react'
import { GitBranch, ImagePlus, Layers, Sigma } from 'lucide-react'
import { useUiStore, type RightTool } from '@/stores/uiStore'
import { LayersPanel } from '@/components/tools/LayersPanel'
import { CreateEquationPanel } from '@/components/tools/CreateEquationPanel'
import { ImportImagePanel } from '@/components/tools/ImportImagePanel'

/** Heavy Process / React Flow editor — loaded only when the Process tab opens. */
const CreateProcessChartPanel = lazy(async () => {
  const m = await import('@/components/tools/CreateProcessChartPanel')
  return { default: m.CreateProcessChartPanel }
})

function prefetchProcessPanel() {
  void import('@/components/tools/CreateProcessChartPanel')
}

function ProcessPanelFallback() {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-4"
      style={{ background: 'var(--neu-bg, #12141a)' }}
      data-testid="process-panel-loading"
    >
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400"
        aria-hidden
      />
      <p className="text-center text-[11px] text-zinc-500">
        Loading process editor…
      </p>
    </div>
  )
}

const tools: { id: RightTool; label: string; icon: typeof Layers }[] = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'equation', label: 'Equation', icon: Sigma },
  { id: 'process', label: 'Process', icon: GitBranch },
  { id: 'image', label: 'Image', icon: ImagePlus },
]

export function RightSidebar() {
  const rightTool = useUiStore((s) => s.rightTool)
  const setRightTool = useUiStore((s) => s.setRightTool)

  return (
    <div className="flex h-full flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex border-b border-zinc-800">
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRightTool(id)}
            onMouseEnter={() => {
              // Warm the chunk before click so open feels instant
              if (id === 'process') prefetchProcessPanel()
            }}
            onFocus={() => {
              if (id === 'process') prefetchProcessPanel()
            }}
            className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition ${
              rightTool === id
                ? 'border-b-2 border-indigo-400 text-indigo-200'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <div
        className={`min-h-0 flex-1 ${
          rightTool === 'equation' ||
          rightTool === 'layers' ||
          rightTool === 'process'
            ? 'overflow-hidden'
            : 'overflow-y-auto'
        }`}
      >
        {rightTool === 'layers' && <LayersPanel />}
        {rightTool === 'equation' && <CreateEquationPanel />}
        {rightTool === 'process' && (
          <Suspense fallback={<ProcessPanelFallback />}>
            <CreateProcessChartPanel />
          </Suspense>
        )}
        {rightTool === 'image' && <ImportImagePanel />}
      </div>
    </div>
  )
}
