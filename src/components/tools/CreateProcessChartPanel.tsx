import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useUiStore } from '@/stores/uiStore'
import { useFlowchartLibraryStore } from '@/stores/flowchartLibraryStore'
import {
  MermaidVisualEditor,
  getVisualEditorMermaidSource,
  getVisualEditorProcessFlow,
} from '@/components/tools/MermaidVisualEditor'
import { isProcessFlowSnapshot } from '@/lib/processFlowSnapshot'
import type { MermaidDiagramKind, MermaidFlowDirection } from '@/types'
import {
  MERMAID_KINDS,
  detectFlowDirection,
  detectMermaidKind,
  isProcessPanelKind,
  mermaidTemplate,
} from '@/lib/mermaidTemplates'
import type { StoredFlowchart } from '@/lib/flowchartLibrary'
import {
  useFlowStore,
  type DiagramKind,
} from '@/vendor/mermaid-visual-editor/lib/store'

const REPLACE_WARNING =
  'Replace the diagram editor with this content?\n\n' +
  'Everything currently in the editor viewport will be discarded. ' +
  'This does not delete canvas cards or cloud library entries unless you already saved there.'

/** True when the interactive editor has real content that would be lost. */
function hasEditorContent(source: string): boolean {
  const fromCanvas = getVisualEditorMermaidSource().trim()
  if (fromCanvas) return true
  const s = source.trim()
  if (!s) return false
  if (/^flowchart\s+\w+\s*\n\s*%%\s*Add nodes/i.test(s)) return false
  const lines = s
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('%%'))
  return lines.length > 1
}

function toEditorKind(kind: MermaidDiagramKind): DiagramKind {
  return kind === 'mindmap' ? 'mindmap' : 'flowchart'
}

/**
 * Process sidebar: Flowchart + Mind map chips share the same interactive
 * React Flow editor (never a static Mermaid preview pane).
 */
export function CreateProcessChartPanel() {
  const addProcessChart = useCanvasStore((s) => s.addProcessChart)
  const updateItem = useCanvasStore((s) => s.updateItem)
  const select = useCanvasStore((s) => s.select)
  const items = useCanvasStore((s) => s.items)
  const user = useAuthStore((s) => s.user)
  const editingProcessChartId = useUiStore((s) => s.editingProcessChartId)
  const endEditProcessChart = useUiStore((s) => s.endEditProcessChart)

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

  /** Canvas card currently open via Edit mode (not canvas selection). */
  const editingChart = useMemo(() => {
    if (!editingProcessChartId) return null
    const it = items.find((i) => i.id === editingProcessChartId)
    if (!it) return null
    if (it.type !== 'process-chart' && !it.mermaidSource && !it.processFlow) {
      return null
    }
    return it
  }, [items, editingProcessChartId])

  const [title, setTitle] = useState('Process chart')
  const [kind, setKind] = useState<MermaidDiagramKind>('flowchart')
  const [direction, setDirection] = useState<MermaidFlowDirection>('TD')
  const [source, setSource] = useState(() => mermaidTemplate('flowchart', 'TD'))
  const [reloadToken, setReloadToken] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const isFlowchart = kind === 'flowchart'
  const chartIdDisplay = editingProcessChartId ?? '—'

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = useCallback((msg: string, ms = 1800) => {
    setStatus(msg)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => {
      setStatus(null)
      flashTimer.current = null
    }, ms)
  }, [])

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    void loadLibrary(user.uid)
  }, [user?.uid, loadLibrary])

  const [editorProcessFlow, setEditorProcessFlow] = useState<
    import('@/lib/processFlowSnapshot').ProcessFlowSnapshot | null
  >(null)
  const prevEditingId = useRef<string | null>(null)

  // Edit-mode card → load into interactive editor (explicit Edit button only)
  useEffect(() => {
    if (!editingProcessChartId) {
      prevEditingId.current = null
      return
    }
    if (prevEditingId.current === editingProcessChartId) return

    const chart = items.find((i) => i.id === editingProcessChartId)
    if (!chart) {
      endEditProcessChart()
      return
    }

    prevEditingId.current = editingProcessChartId
    // Canvas must not stay selected — Delete would remove the card
    select(null)

    setTitle(chart.title || 'Process chart')
    const src = chart.mermaidSource || mermaidTemplate('flowchart', 'TD')
    const k = chart.mermaidKind ?? detectMermaidKind(src)
    if (!isProcessPanelKind(k)) {
      flash(
        'Selected card type is not editable in Process (use Flowchart or Mind map)',
      )
      endEditProcessChart()
      return
    }
    setKind(k)
    setSource(src)
    setDirection(chart.mermaidDirection ?? detectFlowDirection(src) ?? 'TD')
    const snap = chart.processFlow
    setEditorProcessFlow(
      snap && isProcessFlowSnapshot(snap) ? structuredClone(snap) : null,
    )
    setReloadToken((t) => t + 1)
    setActiveLibId(null)
    flash(`Editing “${chart.title || 'Process chart'}”`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when edit target changes
  }, [editingProcessChartId])

  // If the card was deleted while editing, exit edit mode
  useEffect(() => {
    if (!editingProcessChartId) return
    if (!items.some((i) => i.id === editingProcessChartId)) {
      endEditProcessChart()
      prevEditingId.current = null
    }
  }, [items, editingProcessChartId, endEditProcessChart])

  /** Live editor → canvas card bound to edit mode (auto-save) */
  const handleEditorSnapshot = useCallback(
    (
      mermaid: string,
      flow: import('@/lib/processFlowSnapshot').ProcessFlowSnapshot | null,
    ) => {
      const targetId = editingProcessChartId
      if (!targetId) return
      const chart = items.find((i) => i.id === targetId)
      if (!chart) return
      const k = detectMermaidKind(mermaid)
      const dir = detectFlowDirection(mermaid) ?? direction
      // Never write processFlow: undefined — that wipes the card snapshot
      const patch: Parameters<typeof updateItem>[1] = {
        mermaidSource: mermaid,
        mermaidKind: isProcessPanelKind(k) ? k : kind,
        mermaidDirection: dir,
        title: title.trim() || chart.title,
      }
      if (flow && isProcessFlowSnapshot(flow)) {
        patch.processFlow = structuredClone(flow)
      }
      updateItem(targetId, patch)
    },
    [editingProcessChartId, items, direction, kind, title, updateItem],
  )

  const finishEditing = useCallback(() => {
    // Flush latest editor state onto the card before leaving edit mode
    const mermaid = getVisualEditorMermaidSource().trim()
    const flow = getVisualEditorProcessFlow()
    if (editingProcessChartId && mermaid) {
      handleEditorSnapshot(mermaid, flow)
    }
    endEditProcessChart()
    prevEditingId.current = null
    flash('Saved · left edit mode')
  }, [
    editingProcessChartId,
    handleEditorSnapshot,
    endEditProcessChart,
    flash,
  ])

  // Persist title edits while in edit mode (without waiting for a graph change)
  useEffect(() => {
    if (!editingProcessChartId) return
    const chart = items.find((i) => i.id === editingProcessChartId)
    if (!chart) return
    const next = title.trim() || chart.title
    if (next === chart.title) return
    const t = window.setTimeout(() => {
      updateItem(editingProcessChartId, { title: next })
    }, 400)
    return () => window.clearTimeout(t)
  }, [title, editingProcessChartId, items, updateItem])

  // Track which card this panel instance is editing (survives store races on unmount)
  const editingIdRef = useRef<string | null>(editingProcessChartId)
  useEffect(() => {
    editingIdRef.current = editingProcessChartId
  }, [editingProcessChartId])

  // Unmount only when *leaving* Process for real (other tool / sidebar closed).
  // React Strict Mode remounts, or Edit-while-panel-closed → open Process, must
  // NOT clear editingProcessChartId or wipe the RF store mid-edit.
  useEffect(() => {
    return () => {
      const ui = useUiStore.getState()
      const id = editingIdRef.current ?? ui.editingProcessChartId

      // Still on Process with sidebar open → temporary remount (Strict Mode).
      // Keep edit mode + graph so the remounted panel can continue loading.
      if (ui.rightTool === 'process' && ui.rightOpen) {
        return
      }

      // Real leave: flush card snapshot then exit edit mode
      if (id) {
        const mermaid = getVisualEditorMermaidSource().trim()
        const flow = getVisualEditorProcessFlow()
        if (mermaid) {
          const k = detectMermaidKind(mermaid)
          const dir = detectFlowDirection(mermaid) ?? 'TD'
          const patch: Parameters<typeof updateItem>[1] = {
            mermaidSource: mermaid,
            mermaidKind: isProcessPanelKind(k) ? k : 'flowchart',
            mermaidDirection: dir,
          }
          if (flow && isProcessFlowSnapshot(flow)) {
            patch.processFlow = structuredClone(flow)
          }
          useCanvasStore.getState().updateItem(id, patch)
        }
        if (ui.editingProcessChartId === id) {
          ui.endEditProcessChart()
        }
      }
      // Drop RF graph + undo stacks so Process panel unmount doesn't keep
      // large node/edge history in the global flow store.
      useFlowStore.setState({
        nodes: [],
        edges: [],
        past: [],
        future: [],
        clipboard: null,
        selectedWaypoint: null,
      })
      void import('@/vendor/mermaid-visual-editor/lib/liveEdgePaint').then(
        (m) => m.clearAllLiveEdgePaint(),
      )
    }
  }, [])

  const resolveSource = useCallback(() => {
    const fromCanvas = getVisualEditorMermaidSource().trim()
    if (fromCanvas) return fromCanvas
    const fromState = source.trim()
    if (
      fromState &&
      !/^flowchart\s+\w+\s*\n\s*%%\s*Add nodes/i.test(fromState)
    ) {
      return fromState
    }
    return ''
  }, [source])

  const confirmReplaceEditor = useCallback((): boolean => {
    if (!hasEditorContent(source)) return true
    return window.confirm(REPLACE_WARNING)
  }, [source])

  const loadIntoEditor = useCallback(
    (
      next: {
        title?: string
        source: string
        kind?: MermaidDiagramKind
        direction?: MermaidFlowDirection
        libId?: string | null
        /** Free-form snapshot; pass null to force Mermaid layout (clear stale card flow). */
        processFlow?:
          | import('@/lib/processFlowSnapshot').ProcessFlowSnapshot
          | null
      },
      opts?: { skipConfirm?: boolean },
    ) => {
      if (!opts?.skipConfirm && !confirmReplaceEditor()) return false
      const k = next.kind ?? detectMermaidKind(next.source)
      if (!isProcessPanelKind(k)) {
        flash('Only Flowchart and Mind map can be loaded into Process')
        return false
      }
      const d =
        next.direction ?? detectFlowDirection(next.source) ?? direction
      if (next.title !== undefined) setTitle(next.title)
      setKind(k)
      setDirection(d)
      setSource(next.source)
      // Always set processFlow on load — undefined means "clear" so a previous
      // card/library snapshot cannot override the mermaid source import.
      setEditorProcessFlow(
        next.processFlow === undefined
          ? null
          : next.processFlow && isProcessFlowSnapshot(next.processFlow)
            ? structuredClone(next.processFlow)
            : next.processFlow,
      )
      // Leaving edit mode when loading unrelated content
      if (editingProcessChartId) {
        endEditProcessChart()
        prevEditingId.current = null
      }
      setReloadToken((t) => t + 1)
      setActiveLibId(next.libId ?? null)
      return true
    },
    [
      confirmReplaceEditor,
      direction,
      setActiveLibId,
      flash,
      editingProcessChartId,
      endEditProcessChart,
    ],
  )

  /** Same chip wiring for Flowchart and Mind map. */
  const applyTemplate = (nextKind: MermaidDiagramKind) => {
    if (!isProcessPanelKind(nextKind)) return
    const tpl = mermaidTemplate(nextKind, direction)
    const ok = loadIntoEditor({
      source: tpl,
      kind: nextKind,
      direction,
      libId: null,
      processFlow: null, // template = Mermaid layout, not a free-form snapshot
    })
    if (!ok) return
    flash(
      nextKind === 'flowchart'
        ? 'Loaded flowchart template into editor'
        : 'Loaded mind map template into editor',
    )
  }

  const insert = () => {
    const src = resolveSource()
    if (!src) {
      flash('Add at least one node on the canvas first')
      return
    }
    setSource(src)
    const k = detectMermaidKind(src)
    const dir = detectFlowDirection(src) ?? direction
    const captured = getVisualEditorProcessFlow()
    const processFlow = captured ? structuredClone(captured) : undefined
    if (!processFlow) {
      flash('Could not capture diagram — add nodes in the editor first')
      return
    }
    const newId = addProcessChart(src, {
      title: title.trim() || (k === 'mindmap' ? 'Mind map' : 'Process chart'),
      mermaidTheme: 'dark',
      mermaidKind: isProcessPanelKind(k) ? k : kind,
      mermaidDirection: dir,
      processFlow,
    })
    if (processFlow) setEditorProcessFlow(processFlow)
    // Add only — do not auto-open edit mode. User clicks the card's Edit badge
    // (bottom-right) when they want to change the diagram.
    if (newId) {
      select(newId)
    }
    flash('Added to canvas')
  }

  const saveEditingCard = () => {
    if (!editingProcessChartId) return
    const src = resolveSource()
    if (!src) {
      flash('Add at least one node on the canvas first')
      return
    }
    setSource(src)
    const k = detectMermaidKind(src)
    const dir = detectFlowDirection(src) ?? direction
    const captured = getVisualEditorProcessFlow()
    const processFlow = captured ? structuredClone(captured) : undefined
    if (!processFlow) {
      flash('Could not capture diagram — add nodes in the editor first')
      return
    }
    updateItem(editingProcessChartId, {
      title: title.trim() || (editingChart?.title ?? 'Process chart'),
      mermaidSource: src,
      processFlow,
      mermaidTheme: 'dark',
      mermaidKind: isProcessPanelKind(k) ? k : kind,
      mermaidDirection: dir,
    })
    if (processFlow) setEditorProcessFlow(processFlow)
    flash('Saved to canvas card')
  }

  const handleSaveLibrary = async (mode: 'new' | 'overwrite') => {
    if (!user?.uid) {
      flash('Sign in to save diagrams to the cloud')
      return
    }
    const src = resolveSource()
    if (!src) {
      flash('Nothing to save — add nodes first')
      return
    }
    clearLibError()
    const k = detectMermaidKind(src)
    // Capture free-form layout so reload restores positions, not only mermaid text
    // (mind maps use the same processFlow snapshot as flowcharts)
    const processFlow = getVisualEditorProcessFlow() ?? null
    const payload = {
      title:
        title.trim() ||
        (k === 'mindmap' ? 'Untitled mind map' : 'Untitled flowchart'),
      mermaidSource: src,
      mermaidKind: (isProcessPanelKind(k) ? k : 'flowchart') as
        | 'flowchart'
        | 'mindmap',
      mermaidDirection: detectFlowDirection(src) ?? direction,
      processFlow,
    }
    if (mode === 'overwrite') {
      if (!activeLibId) {
        flash('No linked library item — use Save new, or Load one first')
        return
      }
      const ok = await saveOverwrite(user.uid, activeLibId, payload)
      if (ok) flash('Updated cloud library item')
      else flash('Update failed — see cloud library error')
      return
    }
    const created = await saveNew(user.uid, payload)
    if (created) flash('Saved new diagram to cloud library')
    else flash('Save failed — see cloud library error')
  }

  const handleLoadLibraryItem = (item: StoredFlowchart) => {
    const k = item.mermaidKind ?? detectMermaidKind(item.mermaidSource)
    if (!isProcessPanelKind(k)) {
      flash('Only Flowchart and Mind map can be loaded into Process')
      return
    }
    const ok = loadIntoEditor({
      title: item.title,
      source: item.mermaidSource,
      kind: k,
      direction: item.mermaidDirection,
      libId: item.id,
      // Restore free-form layout when present; null forces Mermaid layout
      processFlow: item.processFlow ?? null,
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
  const processLibItems = libItems.filter((item) =>
    isProcessPanelKind(
      item.mermaidKind ?? detectMermaidKind(item.mermaidSource),
    ),
  )

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="process-chart-panel"
      data-process-chart-panel=""
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-800 px-2.5 py-1.5">
        <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
          Process chart
        </span>
        <span className="ml-auto text-[9px] text-zinc-600">
          {isFlowchart ? 'Flowchart' : 'Mind map'} · interactive
        </span>
      </div>

      <div className="shrink-0 space-y-2 border-b border-zinc-800 px-2.5 py-2">
        {/* Title + ID side by side (ID = canvas card id for edit mode) */}
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5">
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
          <label className="flex w-[42%] shrink-0 flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase text-zinc-500">
              ID
            </span>
            <input
              value={chartIdDisplay}
              readOnly
              title={
                editingProcessChartId
                  ? 'Canvas card id for this process chart'
                  : 'Open a chart with Edit on the card to bind an id'
              }
              className="field-input cursor-default truncate py-1 font-mono text-[10px] text-zinc-400"
              data-testid="process-chart-id"
            />
          </label>
        </div>

        {editingProcessChartId && (
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-[10px] text-emerald-200/90">
              Editing canvas card
            </span>
            <button
              type="button"
              onClick={finishEditing}
              className="shrink-0 rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100 hover:bg-emerald-500/20"
              data-testid="process-done-editing"
            >
              Done
            </button>
          </div>
        )}

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
            Both types use the interactive editor. Layout direction is in the
            editor Inspector → Diagram Settings.
          </p>
        </div>

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
              Sign in to save and load diagrams in Firestore.
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
                  {!libLoading && processLibItems.length === 0 && (
                    <p className="px-2 py-2 text-[10px] text-zinc-500">
                      No saved diagrams yet. Use “Save new”.
                    </p>
                  )}
                  {!libLoading &&
                    processLibItems.map((item) => (
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
        <MermaidVisualEditor
          key={kind}
          source={source}
          onSourceChange={setSource}
          processFlow={editorProcessFlow}
          onEditorSnapshot={
            editingProcessChartId ? handleEditorSnapshot : undefined
          }
          reloadToken={reloadToken}
          diagramKind={toEditorKind(kind)}
          onReset={() => {
            // Load built-in example into the interactive editor (not a canvas card).
            // Prefer flowchart example unless the panel is currently on mind map.
            const exampleKind: MermaidDiagramKind =
              kind === 'mindmap' ? 'mindmap' : 'flowchart'
            const tpl = mermaidTemplate(exampleKind, direction)
            const ok = loadIntoEditor(
              {
                source: tpl,
                kind: exampleKind,
                direction,
                libId: null,
                processFlow: null, // Mermaid layout → clean stack + pipes
                title:
                  exampleKind === 'mindmap'
                    ? 'Mind map'
                    : 'Process chart',
              },
              { skipConfirm: true },
            )
            if (!ok) return
            flash(
              exampleKind === 'mindmap'
                ? 'Loaded example mind map into editor'
                : 'Loaded example flowchart into editor',
            )
          }}
          className="h-full min-h-[16rem]"
        />
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-zinc-800 px-2.5 py-2">
        {status && (
          <p className="text-center text-[10px] text-emerald-300/90">{status}</p>
        )}
        <div className="flex gap-1.5">
          {editingProcessChartId ? (
            <>
              <button
                type="button"
                onClick={saveEditingCard}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
                data-testid="mermaid-update-selected"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Save card
              </button>
              <button
                type="button"
                onClick={finishEditing}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-2 text-xs font-medium text-white hover:bg-emerald-500"
                data-testid="process-done-editing-footer"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={insert}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-500 px-2 py-2 text-xs font-medium text-white hover:bg-indigo-400"
              data-testid="mermaid-add-to-canvas"
            >
              <Plus className="h-3.5 w-3.5" />
              Add to canvas
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
