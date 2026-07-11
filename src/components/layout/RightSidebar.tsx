import { ImagePlus, Layers, Sigma } from 'lucide-react'
import { useUiStore, type RightTool } from '@/stores/uiStore'
import { LayersPanel } from '@/components/tools/LayersPanel'
import { CreateEquationPanel } from '@/components/tools/CreateEquationPanel'
import { ImportImagePanel } from '@/components/tools/ImportImagePanel'

const tools: { id: RightTool; label: string; icon: typeof Layers }[] = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'equation', label: 'Equation', icon: Sigma },
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
          rightTool === 'equation' || rightTool === 'layers'
            ? 'overflow-hidden'
            : 'overflow-y-auto'
        }`}
      >
        {rightTool === 'layers' && <LayersPanel />}
        {rightTool === 'equation' && <CreateEquationPanel />}
        {rightTool === 'image' && <ImportImagePanel />}
      </div>
    </div>
  )
}
