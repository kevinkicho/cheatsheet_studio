import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cloud,
  CloudUpload,
  FolderOpen,
  GitBranch,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useCanvasStore } from '@/stores/canvasStore'
import { useAuthStore } from '@/stores/authStore'
import { useFlowchartLibraryStore } from '@/stores/flowchartLibraryStore'
import {
  MermaidVisualEditor,
  getVisualEditorMermaidSource,
} from '@/components/tools/MermaidVisualEditor'
import { MermaidView } from '@/components/math/MermaidView'
import type { MermaidDiagramKind, MermaidFlowDirection } from '@/types'
import {
  MERMAID_DIRECTIONS,
  MERMAID_KINDS,
  applyFlowDirection,
  detectFlowDirection,
  detectMermaidKind,
  mermaidTemplate,
} from '@/lib/mermaidTemplates'
import type { StoredFlowchart } from '@/lib/flowchartLibrary'

const REPLACE_WARNING =
  'Replace the flowchart editor with this content?\n\n' +
  'Everything currently in the editor viewport will be discarded. ' +
  'This does not delete canvas cards or cloud library entries unless you already saved there.'

/** True when the editor has real diagram content that would be lost on replace. */
function hasEditorContent(source: string, isFlowchart: boolean): boolean {
  if (isFlowchart) {
    const fromCanvas = getVisualEditorMermaidSource().trim()
    if (fromCanvas) return true
  }
  const s = source.trim()
  if (!s) return false
  if (/^flowchart\s+\w+\s*\n\s*%%\s*Add nodes/i.test(s)) return false
  // Any non-trivial diagram body (more than header alone)
  const lines = s.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('%%'))
  return lines.length > 1
}

/**
 * Process sidebar: templates + visual flowchart editor (or dark preview for
 * non-flowchart Mermaid kinds). Source is written to process-chart cards.
 * Named diagrams can be saved/loaded from Firestore when signed in.
 */
export function CreateProcessChartPanel() {
  const addProcessChart = useCanvasStore((s) => s.addProcessChart)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const selectedIds = useCanvasStore((s) => s.selectedIds)
  const items = useCanvasStore((s) => s.items)
  const user = useAuthStore((s) => s.user)

  const libItems = useFlowchartLibraryStore((s) => s.items)
  const libLoading = useFlowchartLibraryStore((s) => s.loading)
  const libSaving = useFlowchartLibraryStore((s) => s.saving)
  const libError = useFlowchartLibraryStore((s) => s.error)
  const activeLibId = useFlowchartLibraryStore((s) => s.activeId)
  const loadLibrary = useFlowchartLibraryStore((s) => s.load)
  const saveNew = useFlowchartLibraryStore((s) => s.saveNew)
  const saveOverwrite = useFlowchartLibraryStore((s) => s.saveOverwrite)
  const removeLib = useFlowchartLibraryStore((s) => s.remove)
  const setActiveLibId = useFlowchartLibraryStore((s) => s.setActiveId)
  const clearLibError = useFlowchartLibraryStore((s) => s.clearError)

  const selectedChart = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const it = items.find((i) => i.id === selectedIds[0])
    return it?.type === 'process-chart' ? it : null
  }, [items, selectedIds])

  const [title, setTitle] = useState('Process chart')
  const [kind, setKind] = useState<MermaidDiagramKind>('flowchart')
  const [direction, setDirection] = useState<MermaidFlowDirection>('TD')
  const [source, setSource] = useState(() => mermaidTemplate('flowchart', 'TD'))
  const [reloadToken, setReloadToken] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const isFlowchart = kind === 'flowchart'

  const flash = useCallback((msg: string, ms = 1800) => {
    setStatus(msg)
    window.setTimeout(() => setStatus(null), ms)
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    void loadLibrary(user.uid)
  }, [user?.uid, loadLibrary])

  useEffect(() => {
    if (!selectedChart) return
    setTitle(selectedChart.title || 'Process chart')
    const src =
      selectedChart.mermaidSource || mermaidTemplate('flowchart', 'TD')
    setSource(src)
    setKind(selectedChart.mermaidKind ?? detectMermaidKind(src))
    setDirection(
      selectedChart.mermaidDirection ?? detectFlowDirection(src) ?? 'TD',
    )
    setReloadToken((t) => t + 1)
    setActiveLibId(null)
  }, [selectedChart?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- load on select change

  /** Prefer live visual canvas snapshot so Add never uses a stale/empty React state. */
  const resolveSource = useCallback(() => {
    if (isFlowchart) {
      const fromCanvas = getVisualEditorMermaidSource().trim()
      if (fromCanvas) return fromCanvas
    }
    const fromState = source.trim()
    if (
      fromState &&
      !/^flowchart\s+\w+\s*\n\s*%%\s*Add nodes/i.test(fromState)
    ) {
      return fromState
    }
    return ''
  }, [isFlowchart, source])

  const confirmReplaceEditor = useCallback((): boolean => {
    if (!hasEditorContent(source, isFlowchart)) return true
    return window.confirm(REPLACE_WARNING)
  }, [source, isFlowchart])

  const loadIntoEditor = useCallback(
    (
      next: {
        title?: string
        source: string
        kind?: MermaidDiagramKind
        direction?: MermaidFlowDirection
        libId?: string | null
      },
      opts?: { skipConfirm?: boolean },
    ) => {
      if (!opts?.skipConfirm && !confirmReplaceEditor()) return false
      const k = next.kind ?? detectMermaidKind(next.source)
      const d =
        next.direction ??
        detectFlowDirection(next.source) ??
        direction
      if (next.title !== undefined) setTitle(next.title)
      setKind(k)
      setDirection(d)
      setSource(next.source)
      setReloadToken((t) => t + 1)
      setActiveLibId(next.libId ?? null)
      return true
    },
    [confirmReplaceEditor, direction, setActiveLibId],
  )

  const applyTemplate = (nextKind: MermaidDiagramKind, nextDir = direction) => {
    const tpl = mermaidTemplate(nextKind, nextDir)
    const ok = loadIntoEditor(
      {
        source: tpl,
        kind: nextKind,
        direction: nextDir,
        libId: null,
      },
    )
    if (!ok) return
    flash(
      nextKind === 'flowchart'
        ? 'Loaded flowchart template into editor'
        : `Loaded ${nextKind} template (preview · Add to place on canvas)`,
    )
  }

  const applyDirection = (nextDir: MermaidFlowDirection) => {
    setDirection(nextDir)
    if (kind !== 'flowchart') return
    // Direction rewrite keeps the same graph — no full replace warning
    const base = resolveSource() || source
    const next = applyFlowDirection(
      base || mermaidTemplate('flowchart', nextDir),
      nextDir,
    )
    setSource(next)
    setReloadToken((t) => t + 1)
  }

  const insert = () => {
    const src = resolveSource()
    if (!src) {
      flash(
        isFlowchart
          ? 'Add at least one node on the canvas first'
          : 'Load a template first',
      )
      return
    }
    setSource(src)
    const dir = detectFlowDirection(src) ?? direction
    const k = detectMermaidKind(src)
    addProcessChart(src, {
      title: title.trim() || 'Process chart',
      mermaidTheme: 'dark',
      mermaidKind: k,
      mermaidDirection: dir,
    })
    flash('Added to canvas')
  }

  const updateSelected = () => {
    if (!selectedChart) return
    const src = resolveSource()
    if (!src) {
      flash(
        isFlowchart
          ? 'Add at least one node on the canvas first'
          : 'Load a template first',
      )
      return
    }
    setSource(src)
    const dir = detectFlowDirection(src) ?? direction
    const k = detectMermaidKind(src)
    updateItem(selectedChart.id, {
      title: title.trim() || 'Process chart',
      mermaidSource: src,
      mermaidTheme: 'dark',
      mermaidKind: k,
      mermaidDirection: dir,
    })
    flash('Updated selected chart')
  }

  const handleSaveLibrary = async (mode: 'new' | 'overwrite') => {
    if (!user?.uid) {
      flash('Sign in to save flowcharts to the cloud')
      return
    }
    const src = resolveSource()
    if (!src) {
      flash('Nothing to save — add nodes or load a template first')
      return
    }
    clearLibError()
    const payload = {
      title: title.trim() || 'Untitled flowchart',
      mermaidSource: src,
      mermaidKind: detectMermaidKind(src),
      mermaidDirection: detectFlowDirection(src) ?? direction,
    }
    if (mode === 'overwrite' && activeLibId) {
      const ok = await saveOverwrite(user.uid, activeLibId, payload)
      if (ok) flash('Saved to cloud library')
      return
    }
    const created = await saveNew(user.uid, payload)
    if (created) flash('Saved new flowchart to cloud library')
  }

  const handleLoadLibraryItem = (item: StoredFlowchart) => {
    const ok = loadIntoEditor({
      title: item.title,
      source: item.mermaidSource,
      kind: item.mermaidKind,
      direction: item.mermaidDirection,
      libId: item.id,
    })
    if (ok) {
      setLibraryOpen(false)
      flash(`Loaded “${item.title}” into editor`)
    }
  }

  const handleDeleteLibraryItem = async (item: StoredFlowchart) => {
    if (!user?.uid) return
    if (
      !window.confirm(
        `Delete “${item.title}” from your cloud library?\n\nThis cannot be undone.`,
      )
    ) {
      return
    }
    const ok = await removeLib(user.uid, item.id)
    if (ok) flash('Deleted from cloud library')
  }

  const activeLibTitle = libItems.find((i) => i.id === activeLibId)?.title

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="process-chart-panel"
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 px-2.5 py-1.5">
        <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
          Process chart
        </span>
        <span className="ml-auto text-[9px] text-zinc-600">
          {isFlowchart ? 'Visual' : 'Template'}
        </span>
      </div>

      <div className="shrink-0 space-y-2 border-b border-zinc-800 px-2.5 py-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] font-medium uppercase text-zinc-500">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input py-1 text-[11px]"
            data-testid="mermaid-title"
          />
        </label>

        <div>
          <span className="mb-1 block text-[9px] font-medium uppercase text-zinc-500">
            Diagram type
          </span>
          <div
            className="flex flex-wrap gap-1"
            data-testid="mermaid-kind-templates"
          >
            {MERMAID_KINDS.map((k) => {
              const active = kind === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  title={`${k.description} — replaces editor content`}
                  onClick={() => applyTemplate(k.id)}
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    active
                      ? 'border-indigo-500/70 bg-indigo-500/15 text-indigo-200'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                  }`}
                  data-testid={`mermaid-kind-${k.id}`}
                >
                  {k.label}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[9px] leading-snug text-zinc-600">
            Choosing a type loads that starter into the editor
            {isFlowchart ? ' (interactive flowchart)' : ' (preview only)'}. You
            will be warned if the editor already has content.
          </p>
        </div>

        {isFlowchart && (
          <div>
            <span className="mb-1 block text-[9px] font-medium uppercase text-zinc-500">
              Direction
            </span>
            <div
              className="flex flex-wrap gap-1"
              data-testid="mermaid-directions"
            >
              {MERMAID_DIRECTIONS.map((d) => {
                const active = direction === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => applyDirection(d.id)}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                      active
                        ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700'
                    }`}
                    data-testid={`mermaid-dir-${d.id}`}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Cloud library */}
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Cloud className="h-3 w-3 text-indigo-400/90" />
            <span className="text-[9px] font-medium uppercase text-zinc-500">
              Cloud library
            </span>
            {activeLibId && (
              <span
                className="ml-auto max-w-[8rem] truncate text-[9px] text-indigo-300/80"
                title={activeLibTitle}
              >
                Linked
              </span>
            )}
          </div>
          {!user ? (
            <p className="text-[9px] leading-snug text-zinc-600">
              Sign in to save and load flowcharts in Firestore.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={libSaving}
                  onClick={() => void handleSaveLibrary('new')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-1.5 py-1 text-[10px] text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
                  data-testid="flowchart-save-new"
                  title="Save current editor as a new cloud flowchart"
                >
                  <CloudUpload className="h-3 w-3" />
                  Save new
                </button>
                <button
                  type="button"
                  disabled={libSaving || !activeLibId}
                  onClick={() => void handleSaveLibrary('overwrite')}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-1.5 py-1 text-[10px] text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
                  data-testid="flowchart-save-overwrite"
                  title={
                    activeLibId
                      ? 'Overwrite the linked cloud flowchart'
                      : 'Load a library item first to enable overwrite'
                  }
                >
                  <RefreshCw className="h-3 w-3" />
                  Update saved
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLibraryOpen((o) => !o)
                    if (user?.uid) void loadLibrary(user.uid)
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-1.5 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20"
                  data-testid="flowchart-library-toggle"
                >
                  <FolderOpen className="h-3 w-3" />
                  {libraryOpen ? 'Hide list' : 'Load…'}
                </button>
              </div>
              {libError && (
                <p className="mt-1 text-[9px] leading-snug text-rose-400/90">
                  {libError}
                </p>
              )}
              {libraryOpen && (
                <div
                  className="mt-2 max-h-36 overflow-y-auto rounded border border-zinc-800"
                  data-testid="flowchart-library-list"
                >
                  {libLoading && (
                    <p className="px-2 py-2 text-[10px] text-zinc-500">
                      Loading…
                    </p>
                  )}
                  {!libLoading && libItems.length === 0 && (
                    <p className="px-2 py-2 text-[10px] text-zinc-500">
                      No saved flowcharts yet. Use “Save new”.
                    </p>
                  )}
                  {!libLoading &&
                    libItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-1 border-b border-zinc-800/80 px-1.5 py-1 last:border-0 ${
                          item.id === activeLibId ? 'bg-indigo-500/10' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleLoadLibraryItem(item)}
                          className="min-w-0 flex-1 truncate text-left text-[10px] text-zinc-200 hover:text-white"
                          title={`Load “${item.title}” into editor`}
                        >
                          {item.title}
                          <span className="ml-1 text-[9px] text-zinc-600">
                            {item.mermaidKind}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteLibraryItem(item)}
                          className="shrink-0 rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"
                          title="Delete from library"
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2">
        {isFlowchart ? (
          <MermaidVisualEditor
            source={source}
            onSourceChange={setSource}
            reloadToken={reloadToken}
            className="h-full min-h-[16rem]"
          />
        ) : (
          <div
            className="flex h-full min-h-[16rem] flex-col overflow-hidden rounded-md border border-zinc-700/80 bg-[#12141a]"
            data-testid="mermaid-template-preview"
          >
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <MermaidView
                source={source}
                theme="dark"
                forceDark
                className="h-full w-full"
              />
            </div>
            <p className="shrink-0 border-t border-zinc-800 px-2 py-1 text-[9px] text-zinc-500">
              Preview only · switch to Flowchart for interactive editing
            </p>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-zinc-800 px-2.5 py-2">
        {status && (
          <p className="text-center text-[10px] text-emerald-300/90">{status}</p>
        )}
        <div className="flex gap-1.5">
          {selectedChart && (
            <button
              type="button"
              onClick={updateSelected}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
              data-testid="mermaid-update-selected"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Update card
            </button>
          )}
          <button
            type="button"
            onClick={insert}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-500 px-2 py-2 text-xs font-medium text-white hover:bg-indigo-400"
            data-testid="mermaid-add-to-canvas"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to canvas
          </button>
        </div>
      </div>
    </div>
  )
}
