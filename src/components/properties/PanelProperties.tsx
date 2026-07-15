import { useEffect, useState } from 'react'
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
  const lastAutoLayout = useCanvasStore((s) => s.lastAutoLayout)

  // Gap knobs for in-panel pack — seed from last sheet/panel auto-layout
  const [l2PanelGap, setL2PanelGap] = useState(
    () => lastAutoLayout?.l2PanelGap ?? lastAutoLayout?.gap ?? 2,
  )
  const [blockGap, setBlockGap] = useState(
    () => lastAutoLayout?.blockGap ?? 2,
  )
  // Keep sliders in sync when sheet auto-layout or prior in-panel run updates gaps
  useEffect(() => {
    if (lastAutoLayout?.l2PanelGap != null) {
      setL2PanelGap(lastAutoLayout.l2PanelGap)
    } else if (lastAutoLayout?.gap != null) {
      setL2PanelGap(lastAutoLayout.gap)
    }
    if (lastAutoLayout?.blockGap != null) {
      setBlockGap(lastAutoLayout.blockGap)
    }
  }, [
    lastAutoLayout?.l2PanelGap,
    lastAutoLayout?.blockGap,
    lastAutoLayout?.gap,
  ])

  const memberCount = panel.memberIds?.length ?? 0
  const showTitle = panel.showTitle !== false
  // Default: Name A→Z (top option, on by default for Auto-layout inside panel)
  const contentSort = panel.contentSort ?? 'name-asc'
  const level = panel.hierarchyLevel ?? 1
  const shape = panel.shape ?? 'rect'
  // Gap knobs depend on selected panel depth:
  //   L1 → L2 sibling gap + block gap (packing subsections + cards)
  //   L2+ → block gap only (leaf card pack)
  const showL2Gap = level <= 1
  const showBlockGap = true

  const runInPanel = (shape: PanelShape) => {
    // Always pass numeric gaps (including 0) so store never falls back to stale defaults
    const gaps = showL2Gap
      ? {
          l2PanelGap: Math.max(0, Number(l2PanelGap) || 0),
          blockGap: Math.max(0, Number(blockGap) || 0),
        }
      : {
          blockGap: Math.max(0, Number(blockGap) || 0),
        }
    autoLayoutSelectedPanel(shape, gaps)
  }

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

        <div className="mb-2 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Gap
          </p>
          <p className="text-[9px] leading-snug text-zinc-600">
            {showL2Gap
              ? 'L1 selected: set L2 subsection spacing and card (block) gap.'
              : 'L2+ selected: set spacing between cards inside this panel.'}
          </p>
          {showL2Gap ? (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">
                Level 2 panel gap · {l2PanelGap}px
              </span>
              <input
                type="range"
                min={0}
                max={48}
                step={2}
                value={l2PanelGap}
                onChange={(e) => setL2PanelGap(Number(e.target.value))}
                className="w-full"
                data-testid="panel-l2-gap-slider"
              />
              <span className="text-[9px] text-zinc-600">
                Distance between L2 subsection frames inside this L1.
              </span>
            </label>
          ) : null}
          {showBlockGap ? (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500">
                Block gap · {blockGap}px
              </span>
              <input
                type="range"
                min={0}
                max={48}
                step={2}
                value={blockGap}
                onChange={(e) => setBlockGap(Number(e.target.value))}
                className="w-full"
                data-testid="panel-block-gap-slider"
              />
              <span className="text-[9px] text-zinc-600">
                Distance between cards (blocks) inside a leaf pack.
              </span>
            </label>
          ) : null}
        </div>

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
              onClick={() => runInPanel(id as PanelShape)}
              disabled={memberCount === 0}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2 py-1.5 text-[11px] font-medium text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-snug text-zinc-600">
          Uses the same densify engine as sheet auto-layout (multi-order free-flow
          + leaf re-pack). Panel grows to fit; top-left stays put.{' '}
          <strong className="font-medium text-zinc-500">Rectangle</strong> /{' '}
          <strong className="font-medium text-zinc-500">N-gon</strong> only change
          chrome. Gaps above apply on each click.
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
