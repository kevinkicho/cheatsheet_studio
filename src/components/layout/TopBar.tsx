import { useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  Cloud,
  Download,
  FilePlus2,
  LayoutGrid,
  Layers,
  LogOut,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useCanvasStore } from '@/stores/canvasStore'
import { useSheetsStore } from '@/stores/sheetsStore'
import { useUiStore, type AppView } from '@/stores/uiStore'
import { downloadWorkspaceSheetJson } from '@/lib/exportSheetDocument'
import { PrintSizeMenu } from './PrintSizeMenu'
import { ExportMenu, type ExportStatusKind } from './ExportMenu'

export function TopBar() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const title = useCanvasStore((s) => s.title)
  const dirty = useCanvasStore((s) => s.dirty)
  const setTitle = useCanvasStore((s) => s.setTitle)
  const pastLen = useCanvasStore((s) => s.past.length)
  const futureLen = useCanvasStore((s) => s.future.length)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [exportStatusKind, setExportStatusKind] = useState<ExportStatusKind>(
    'info',
  )
  const sheets = useSheetsStore((s) => s.sheets)
  const activeSheetId = useSheetsStore((s) => s.activeSheetId)
  const cloudAvailable = useSheetsStore((s) => s.cloudAvailable)
  const saveStatus = useSheetsStore((s) => s.saveStatus)
  const lastCloudError = useSheetsStore((s) => s.lastCloudError)
  const createSheet = useSheetsStore((s) => s.createSheet)
  const openSheet = useSheetsStore((s) => s.openSheet)
  const saveActiveSheet = useSheetsStore((s) => s.saveActiveSheet)
  const retryCloudSync = useSheetsStore((s) => s.retryCloudSync)
  const canvasSheetId = useCanvasStore((s) => s.sheetId)
  const currentSheetId = activeSheetId ?? canvasSheetId ?? ''
  const isLocalSheet = currentSheetId.startsWith('local_')
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const bottomOpen = useUiStore((s) => s.bottomOpen)
  const setLeftOpen = useUiStore((s) => s.setLeftOpen)
  const setRightOpen = useUiStore((s) => s.setRightOpen)
  const setBottomOpen = useUiStore((s) => s.setBottomOpen)

  const statusLabel = (() => {
    if (!user) return 'Sign in to save'
    if (saveStatus === 'saving') return 'Syncing…'
    if (saveStatus === 'error') return 'Save failed'
    if (dirty) return 'Unsaved'
    if (isLocalSheet || saveStatus === 'local') return 'Local only'
    if (cloudAvailable === false && !isLocalSheet) return 'Cloud issue'
    if (saveStatus === 'saved') return 'Cloud saved'
    return 'Cloud ready'
  })()

  const statusClass = (() => {
    if (!user) return 'text-zinc-500'
    if (saveStatus === 'saving') return 'text-sky-400'
    if (saveStatus === 'error') return 'text-rose-400'
    if (dirty) return 'text-amber-400'
    if (isLocalSheet || saveStatus === 'local' || cloudAvailable === false)
      return 'text-amber-200'
    return 'text-emerald-500/80'
  })()

  const statusTitle = (() => {
    if (!user) return 'Sign in with Google to autosave sheets to Firebase'
    if (lastCloudError) return lastCloudError
    if (isLocalSheet)
      return 'This sheet is only in the browser. Click Save or Sync to upload to Firestore.'
    return 'Autosaves to Cloud Firestore ~1s after edits'
  })()

  const nav: { id: AppView; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'workspace', label: 'Workspace', icon: LayoutGrid },
    { id: 'library', label: 'Library', icon: BookOpen },
    { id: 'sheets', label: 'My Sheets', icon: Layers },
  ]

  return (
    <header className="relative z-50 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-3 backdrop-blur">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-xs font-bold text-white">
          Σ
        </div>
        <span className="hidden text-sm font-semibold tracking-tight text-zinc-100 sm:inline">
          CheatSheet Studio
        </span>
      </div>

      <nav className="flex items-center gap-0.5">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              view === id
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mx-2 hidden h-5 w-px bg-zinc-800 lg:block" />

      {view === 'workspace' && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 max-w-[220px] truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-100 outline-none hover:border-zinc-700 focus:border-indigo-500 focus:bg-zinc-900"
            title="Sheet title"
          />
          <span
            className={`inline-flex max-w-[9rem] items-center gap-1 truncate text-[10px] uppercase tracking-wide ${statusClass}`}
            title={statusTitle}
          >
            <Cloud className="h-3 w-3 shrink-0 opacity-70" />
            {statusLabel}
          </span>

          <button
            type="button"
            title={
              user
                ? isLocalSheet
                  ? 'Upload this sheet to Cloud Firestore'
                  : 'Save sheet to Firebase now'
                : 'Sign in to save to Firebase'
            }
            disabled={!user || saveStatus === 'saving'}
            onClick={() => {
              if (!user) return
              if (isLocalSheet || cloudAvailable === false) {
                void retryCloudSync(user.uid)
              } else {
                void saveActiveSheet(user.uid)
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isLocalSheet ? 'Sync' : 'Save'}
            </span>
          </button>

          <button
            type="button"
            title="Download this sheet as agent-compatible JSON (re-open via My Sheets → Import JSON)"
            data-testid="export-sheet-json"
            onClick={() => downloadWorkspaceSheetJson()}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Export JSON</span>
          </button>

          <div className="ml-0.5 flex items-center gap-0.5">
            <button
              type="button"
              title="Undo (Ctrl+Z)"
              disabled={pastLen === 0}
              onClick={() => undo()}
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              disabled={futureLen === 0}
              onClick={() => redo()}
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative ml-1 min-w-[7.5rem] max-w-[11rem]">
            <select
              className="w-full appearance-none truncate rounded-md border border-zinc-800 bg-zinc-900 py-1 pl-2 pr-7 text-xs text-zinc-200 outline-none focus:border-indigo-500"
              value={
                sheets.some((s) => s.id === currentSheetId)
                  ? currentSheetId
                  : sheets[0]?.id ?? ''
              }
              title="Switch sheet"
              aria-label="Switch sheet"
              onChange={(e) => {
                if (e.target.value) void openSheet(e.target.value)
              }}
              disabled={sheets.length === 0}
            >
              {sheets.length === 0 ? (
                <option value="">No sheets</option>
              ) : (
                sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || 'Untitled'}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          </div>

          <button
            type="button"
            title="New sheet"
            onClick={() => {
              if (user) void createSheet(user.uid)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>

          <PrintSizeMenu />

          <ExportMenu
            busy={exportBusy}
            setBusy={setExportBusy}
            setStatus={setExportStatus}
            setStatusKind={setExportStatusKind}
          />
        </div>
      )}

      {exportStatus && view === 'workspace' && (
        <div
          role="status"
          data-testid="export-pdf-status"
          className={`pointer-events-none absolute left-1/2 top-full z-[60] mt-1 max-w-[min(28rem,92vw)] -translate-x-1/2 rounded-md border px-3 py-1.5 text-center text-[11px] shadow-lg ${
            exportStatusKind === 'err'
              ? 'border-rose-500/40 bg-rose-950/95 text-rose-100'
              : exportStatusKind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-100'
                : 'border-zinc-700 bg-zinc-900/95 text-zinc-200'
          }`}
          title={exportStatus}
        >
          {exportStatus}
        </div>
      )}

      {view !== 'workspace' && <div className="flex-1" />}

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Toggle left sidebar"
          onClick={() => setLeftOpen(!leftOpen)}
          className={`rounded-md p-1.5 ${leftOpen ? 'text-indigo-300' : 'text-zinc-500'} hover:bg-zinc-900`}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Toggle right sidebar"
          onClick={() => setRightOpen(!rightOpen)}
          className={`rounded-md p-1.5 ${rightOpen ? 'text-indigo-300' : 'text-zinc-500'} hover:bg-zinc-900`}
        >
          <PanelRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Toggle library panel"
          onClick={() => setBottomOpen(!bottomOpen)}
          className={`rounded-md p-1.5 ${bottomOpen ? 'text-indigo-300' : 'text-zinc-500'} hover:bg-zinc-900`}
        >
          <PanelBottom className="h-4 w-4" />
        </button>
      </div>

      <div className="ml-1 flex items-center gap-2 border-l border-zinc-800 pl-3">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="h-7 w-7 rounded-full border border-zinc-700"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">
            {user?.displayName?.[0] ?? '?'}
          </div>
        )}
        <span className="hidden max-w-[120px] truncate text-xs text-zinc-400 lg:inline">
          {user?.displayName}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          title="Sign out"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
