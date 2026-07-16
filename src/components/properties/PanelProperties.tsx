import { useEffect, useRef, useState } from 'react'
import { Check, LayoutGrid, LayoutTemplate } from 'lucide-react'
import type { LayoutPanel } from '@/types'
import { useCanvasStore } from '@/stores/canvasStore'
import {
  GROUP_SORT_ORDER,
  GROUP_SORT_PRESETS,
  type GroupSortOrder,
} from '@/lib/autoOrganize/constants'

/** How long the Organize button shows the success checkmark. */
const ORGANIZE_OK_MS = 1400

/**
 * Fine-tune a selected layout panel (left sidebar when a panel is selected).
 */
export function PanelProperties({ panel }: { panel: LayoutPanel }) {
  const updateLayoutPanel = useCanvasStore((s) => s.updateLayoutPanel)
  const autoLayoutSelectedPanel = useCanvasStore(
    (s) => s.autoLayoutSelectedPanel,
  )
  const selectPanel = useCanvasStore((s) => s.selectPanel)
  const removeLayoutPanels = useCanvasStore((s) => s.removeLayoutPanels)
  const lastAutoLayout = useCanvasStore((s) => s.lastAutoLayout)

  // Gap knobs for in-panel pack — seed from last sheet/panel auto-layout
  const [l2PanelGap, setL2PanelGap] = useState(
    () => lastAutoLayout?.l2PanelGap ?? lastAutoLayout?.gap ?? 2,
  )
  const [blockGap, setBlockGap] = useState(
    () => lastAutoLayout?.blockGap ?? 2,
  )
  /** Errors only — success is a checkmark on the Organize button. */
  const [error, setError] = useState<string | null>(null)
  const [flashOk, setFlashOk] = useState(false)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Reset success flash / error when switching panels
  useEffect(() => {
    setError(null)
    setFlashOk(false)
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }, [panel.id])

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    },
    [],
  )

  // Prefer explicit memberIds; geometry recovery happens in the store on pack
  const memberCount = panel.memberIds?.length ?? 0
  const showTitle = panel.showTitle !== false
  // Same options as sheet Auto-layout “Group sort” (default densest for pack)
  const contentSort: GroupSortOrder = panel.contentSort ?? 'none'
  const level = panel.hierarchyLevel ?? 1
  // Gap knobs depend on selected panel depth:
  //   L1 → L2 sibling gap + block gap (packing subsections + cards)
  //   L2+ → block gap only (leaf card pack)
  const showL2Gap = level <= 1
  const showBlockGap = true

  const runInPanel = () => {
    // Always pass numeric gaps (including 0) so store never falls back to stale defaults
    const gaps = showL2Gap
      ? {
          l2PanelGap: Math.max(0, Number(l2PanelGap) || 0),
          blockGap: Math.max(0, Number(blockGap) || 0),
        }
      : {
          blockGap: Math.max(0, Number(blockGap) || 0),
        }
    const result = autoLayoutSelectedPanel('rect', gaps)
    if (!result.ok) {
      setFlashOk(false)
      setError(result.reason ?? 'Auto-layout failed')
      return
    }
    // Success (cards moved or already densest): checkmark on the button only —
    // no “click again for another seed” text (re-click rarely changes anything).
    setError(null)
    setFlashOk(true)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setFlashOk(false)
      flashTimerRef.current = null
    }, ORGANIZE_OK_MS)
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

        {/* Same control as sheet Auto-layout “Group sort” */}
        <div className="mb-2 space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950/30 p-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Group sort
          </p>
          <p className="text-[9px] leading-snug text-zinc-600">
            Same as sheet Auto-layout: name flow or densest free-flow. Applied
            when you click Organize below.
          </p>
          <div className="grid grid-cols-1 gap-1">
            {GROUP_SORT_ORDER.map((id) => {
              const p = GROUP_SORT_PRESETS[id]
              const active = contentSort === id
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`panel-content-sort-${id}`}
                  onClick={() => {
                    // Preference only — dense pack applies on Auto-layout click
                    // (same as sheet groupSort before Run).
                    updateLayoutPanel(panel.id, { contentSort: id })
                  }}
                  className={`rounded-md border px-2 py-1.5 text-left transition ${
                    active
                      ? 'border-violet-500/50 bg-violet-500/12 text-violet-100'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <span className="block text-[11px] font-medium">{p.label}</span>
                  <span className="mt-0.5 block text-[9px] leading-snug text-zinc-500">
                    {p.hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          data-testid="panel-auto-layout-organize"
          data-organize-ok={flashOk ? '1' : undefined}
          onClick={() => runInPanel()}
          aria-label={flashOk ? 'Organized' : 'Organize'}
          className={`relative inline-flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors duration-200 ${
            flashOk
              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-50'
              : 'border-indigo-500/40 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25'
          }`}
        >
          {flashOk ? (
            <span
              key="ok"
              className="inline-flex items-center gap-1.5 animate-[organize-ok-pop_0.45s_ease-out]"
              data-testid="panel-auto-layout-ok"
            >
              {/* Animated check: circle grows, then stroke draws */}
              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-emerald-400/25 animate-[organize-ok-ring_0.5s_ease-out]" />
                <Check
                  className="relative h-3.5 w-3.5 text-emerald-300"
                  strokeWidth={2.75}
                  aria-hidden
                />
              </span>
              Organized
            </span>
          ) : (
            <span key="idle" className="inline-flex items-center gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Organize
            </span>
          )}
        </button>
        {error ? (
          <p
            className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-snug text-rose-100"
            data-testid="panel-auto-layout-status"
          >
            {error}
          </p>
        ) : null}
        <p className="mt-1 text-[9px] leading-snug text-zinc-600">
          1) Drag panel handles to set the frame size (cards keep their size).
          2) Click Organize to pack cards into that box. A checkmark on the
          button means it ran successfully. If pack fails (e.g. no cards), run
          sheet Auto-layout once first.
        </p>
        {memberCount === 0 ? (
          <p className="mt-1 text-[10px] text-amber-300/90">
            This panel lists 0 member cards — pack will try to recover cards
            whose centers sit inside the frame.
          </p>
        ) : null}
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

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => selectPanel(null)}
          className="w-full rounded-md border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        >
          Deselect panel
        </button>
        <button
          type="button"
          title="Remove panel chrome only — cards stay on the sheet"
          onClick={() => {
            if (
              window.confirm(
                `Delete panel “${panel.title || panel.id}”? Cards stay on the sheet; only the frame is removed.`,
              )
            ) {
              removeLayoutPanels([panel.id])
            }
          }}
          className="w-full rounded-md border border-rose-900/50 bg-rose-950/30 px-2 py-1.5 text-[11px] text-rose-300/90 hover:border-rose-700/60 hover:bg-rose-950/50"
        >
          Delete panel (keep cards)
        </button>
      </div>
    </div>
  )
}
