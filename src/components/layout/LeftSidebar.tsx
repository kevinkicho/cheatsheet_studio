import { PropertiesPanel } from '@/components/properties/PropertiesPanel'
import { useCanvasStore } from '@/stores/canvasStore'

export function LeftSidebar() {
  const hasSelection = useCanvasStore((s) => s.selectedIds.length > 0)

  return (
    <div className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold text-zinc-300">
          {hasSelection ? 'Card properties' : 'Sheet properties'}
        </h2>
        <p className="mt-0.5 text-[10px] text-zinc-600">
          {hasSelection
            ? 'Click empty canvas for sheet / auto layout / grid'
            : 'Title, auto layout, grid covers'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PropertiesPanel />
      </div>
    </div>
  )
}
