import { PropertiesPanel } from '@/components/properties/PropertiesPanel'

export function LeftSidebar() {
  return (
    <div className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold text-zinc-300">Properties</h2>
      </div>
      <div className="min-h-0 flex-1">
        <PropertiesPanel />
      </div>
    </div>
  )
}
