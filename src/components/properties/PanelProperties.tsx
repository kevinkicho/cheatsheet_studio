import { LayoutGrid, LayoutTemplate } from 'lucide-react'
import type { LayoutPanel, PanelShape } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'

/**
 * Fine-tune a selected layout panel (left sidebar when a panel is selected).
 */
export function PanelProperties({ panel }: { panel: LayoutPanel }) {
  const updateLayoutPanel = useCanvasStore((s) => s.updateLayoutPanel)
  const autoLayoutSelectedPanel = useCanvasStore(
    (s) => s.autoLayoutSelectedPanel,
  )
  const selectPanel = useCanvasStore((s) => s.selectPanel)
  const memberCount = panel.memberIds?.length ?? 0
  const showTitle = panel.showTitle !== false
  // Default: Name A→Z (top option, on by default for Auto-layout inside panel)
  const contentSort = panel.contentSort ?? 'name-asc'
  const level = panel.hierarchyLevel
  const shape = panel.shape ?? 'rect'

  return (
    <div className="space-y-3 p-3" data-testid="panel-properties">
      <div className="flex items-start gap-2">
        <LayoutTemplate className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-200">Panel</p>
          <p className="truncate text-[11px] text-zinc-500">
            {panel.title || panel.id}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {memberCount} card{memberCount === 1 ? '' : 's'}
            {level != null ? ` · L${level}` : ''}
            {shape === 'polygon' ? ' · n-gon' : ' · rect'}
            {panel.folderId ? ` · folder ${panel.folderId}` : ''}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Auto-layout inside panel
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['rect', 'Rectangle'],
              ['polygon', 'N-gon'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`panel-auto-layout-${id}`}
              onClick={() => autoLayoutSelectedPanel(id as PanelShape)}
              disabled={memberCount === 0}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2 py-1.5 text-[11px] font-medium text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-zinc-600">
          Dense free-flow at full card size (each click tries a new pack seed).
          Rebuilds this frame and nested L2/L3 with the chosen chrome — rectangle
          box or stepped n-gon.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-zinc-500">Title</span>
        <input
          type="text"
          className="field-input text-xs"
          value={panel.title ?? ''}
          onChange={(e) =>
            updateLayoutPanel(panel.id, { title: e.target.value })
          }
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={showTitle}
          onChange={(e) =>
            updateLayoutPanel(panel.id, { showTitle: e.target.checked })
          }
          className="rounded border-zinc-600"
        />
        Show title chip
      </label>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Sort cards in panel
        </p>
        <div className="flex flex-col gap-1">
          {(
            [
              ['name-asc', 'Name A→Z'],
              ['name-desc', 'Name Z→A'],
              ['none', 'No sorting (keep order)'],
            ] as const
          ).map(([id, label]) => {
            const active = contentSort === id
            return (
              <button
                key={id}
                type="button"
                data-testid={`panel-content-sort-${id}`}
                onClick={() => {
                  updateLayoutPanel(panel.id, { contentSort: id })
                }}
                className={`rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                  active
                    ? 'border-violet-500/50 bg-violet-500/12 text-violet-100'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-zinc-600">
          Re-packs only this panel’s cards (shelf). Use Auto-layout for dense
          free-flow + chrome rebuild.
        </p>
      </div>

      <button
        type="button"
        onClick={() => selectPanel(null)}
        className="w-full rounded-md border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
      >
        Deselect panel
      </button>
    </div>
  )
}
